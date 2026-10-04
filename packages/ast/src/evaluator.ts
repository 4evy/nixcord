import { type Node, SyntaxKind, type TypeChecker } from 'ts-morph';
import { evaluateCall } from './evaluation/calls.js';
import {
  evaluateArray,
  evaluateBinary,
  evaluateObject,
  evaluateTemplate,
  evaluateUnary,
} from './evaluation/expressions.js';
import {
  evaluateElementAccess,
  evaluateIdentifier,
  evaluatePropertyAccess,
} from './evaluation/references.js';
import {
  type Environment,
  type EvaluationContext,
  type EvaluationResult,
  type EvaluationState,
  isCallable,
  known,
  type RuntimeValue,
  type StaticEvaluatorOptions,
  unknown,
} from './evaluation/runtime.js';
import { unwrapExpression } from './nodes.js';

export type {
  EvaluationEvidence,
  EvaluationResult,
  StaticEvaluatorOptions,
  StaticScalar,
  StaticValue,
} from './evaluation/runtime.js';

const nodeKey = (node: Node): string =>
  `${node.getSourceFile().getFilePath()}:${node.getStart()}:${node.getEnd()}`;

// Own recursion, limits, memoization, and dispatch across evaluation responsibilities
export class StaticEvaluator {
  readonly #context: EvaluationContext;
  readonly #maxDepth: number;
  readonly #maxOperations: number;
  readonly #memo = new Map<string, EvaluationResult<RuntimeValue>>();

  constructor(checker: TypeChecker, options: StaticEvaluatorOptions = {}) {
    this.#maxDepth = options.maxDepth ?? 64;
    this.#maxOperations = options.maxOperations ?? 20_000;
    this.#context = {
      checker,
      constants: options.constants ?? {},
      evaluate: this.#evaluate.bind(this),
      chargeOperations: this.#chargeOperations.bind(this),
    };
  }

  evaluate(node: Node, environment: Environment = new Map()): EvaluationResult<RuntimeValue> {
    return this.#evaluate(unwrapExpression(node), environment, 0, {
      operations: 0,
      active: new Set(),
    });
  }

  #evaluate(
    node: Node,
    environment: Environment,
    depth: number,
    state: EvaluationState
  ): EvaluationResult<RuntimeValue> {
    node = unwrapExpression(node);
    if (depth > this.#maxDepth) return unknown('evaluation depth limit exceeded', node);
    state.operations++;
    if (state.operations > this.#maxOperations)
      return unknown('evaluation operation limit exceeded', node);

    const cacheable = environment.size === 0;
    const key = nodeKey(node);
    if (cacheable) {
      const memoized = this.#memo.get(key);
      if (memoized) return memoized;
    }
    if (state.active.has(key)) return unknown('cyclic expression dependency', node);
    state.active.add(key);

    const result = this.#dispatch(node, environment, depth, state);
    state.active.delete(key);
    if (cacheable && result.known && !isCallable(result.value)) this.#memo.set(key, result);
    return result;
  }

  #chargeOperations(amount: number, state: EvaluationState, node: Node): EvaluationResult<true> {
    if (!Number.isSafeInteger(amount) || amount < 0)
      return unknown('invalid collection size', node);
    state.operations += amount;
    return state.operations > this.#maxOperations
      ? unknown('evaluation operation limit exceeded', node)
      : known(true, node);
  }

  #dispatch(
    node: Node,
    environment: Environment,
    depth: number,
    state: EvaluationState
  ): EvaluationResult<RuntimeValue> {
    if (node.isKind(SyntaxKind.StringLiteral)) return known(node.getLiteralValue(), node);
    if (node.isKind(SyntaxKind.NoSubstitutionTemplateLiteral))
      return known(node.getLiteralValue(), node);
    if (node.isKind(SyntaxKind.NumericLiteral)) return known(node.getLiteralValue(), node);
    if (node.isKind(SyntaxKind.BigIntLiteral)) return known(node.getText().replace(/n$/, ''), node);
    if (node.isKind(SyntaxKind.RegularExpressionLiteral))
      return known(node.getLiteralValue(), node);
    if (node.isKind(SyntaxKind.TrueKeyword)) return known(true, node);
    if (node.isKind(SyntaxKind.FalseKeyword)) return known(false, node);
    if (node.isKind(SyntaxKind.NullKeyword)) return known(null, node);
    if (node.isKind(SyntaxKind.UndefinedKeyword)) return known(undefined, node);

    if (node.isKind(SyntaxKind.Identifier))
      return evaluateIdentifier(this.#context, node, environment, depth, state);
    if (node.isKind(SyntaxKind.ArrayLiteralExpression))
      return evaluateArray(this.#context, node, environment, depth, state);
    if (node.isKind(SyntaxKind.ObjectLiteralExpression))
      return evaluateObject(this.#context, node, environment, depth, state);
    if (node.isKind(SyntaxKind.TemplateExpression))
      return evaluateTemplate(this.#context, node, environment, depth, state);
    if (node.isKind(SyntaxKind.PropertyAccessExpression))
      return evaluatePropertyAccess(this.#context, node, environment, depth, state);
    if (node.isKind(SyntaxKind.ElementAccessExpression))
      return evaluateElementAccess(this.#context, node, environment, depth, state);
    if (node.isKind(SyntaxKind.BinaryExpression))
      return evaluateBinary(this.#context, node, environment, depth, state);
    if (node.isKind(SyntaxKind.ConditionalExpression)) {
      const condition = this.#evaluate(node.getCondition(), environment, depth + 1, state);
      if (!condition.known) return condition;
      return this.#evaluate(
        Boolean(condition.value) ? node.getWhenTrue() : node.getWhenFalse(),
        environment,
        depth + 1,
        state
      );
    }
    if (node.isKind(SyntaxKind.PrefixUnaryExpression))
      return evaluateUnary(this.#context, node, environment, depth, state);
    if (node.isKind(SyntaxKind.CallExpression))
      return evaluateCall(this.#context, node, environment, depth, state);
    if (
      node.isKind(SyntaxKind.ArrowFunction) ||
      node.isKind(SyntaxKind.FunctionDeclaration) ||
      node.isKind(SyntaxKind.FunctionExpression)
    )
      return known({ callable: true, node, environment }, node);

    return unknown(`unsupported ${node.getKindName()}`, node);
  }
}

export const createStaticEvaluator = (
  checker: TypeChecker,
  options?: StaticEvaluatorOptions
): StaticEvaluator => new StaticEvaluator(checker, options);
