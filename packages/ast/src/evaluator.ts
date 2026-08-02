import { dirname, resolve } from 'node:path';
import {
  type ArrowFunction,
  type BinaryExpression,
  type BindingName,
  type Block,
  type CallExpression,
  type Expression,
  type FunctionDeclaration,
  type FunctionExpression,
  type Node,
  type ParameterDeclaration,
  type Statement,
  SyntaxKind,
  type TypeChecker,
} from 'ts-morph';
import { resolvedDeclaration, unwrapExpression } from './node-helpers.js';

export type StaticScalar = null | string | number | boolean;
export type StaticValue =
  | undefined
  | StaticScalar
  | readonly StaticValue[]
  | { readonly [key: string]: StaticValue };

export interface EvaluationEvidence {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly kind: string;
}

export type EvaluationResult<T = StaticValue> =
  | { readonly known: true; readonly value: T; readonly evidence: readonly EvaluationEvidence[] }
  | {
      readonly known: false;
      readonly reason: string;
      readonly evidence: readonly EvaluationEvidence[];
    };

export interface StaticEvaluatorOptions {
  readonly maxDepth?: number;
  readonly maxOperations?: number;
  readonly constants?: Readonly<Record<string, StaticValue>>;
}

type Environment = ReadonlyMap<string, RuntimeValue>;
type RuntimeValue = StaticValue | RegExp | CallableValue;
type CallableNode = ArrowFunction | FunctionDeclaration | FunctionExpression;

interface CallableValue {
  readonly callable: true;
  readonly node: CallableNode;
  readonly environment: Environment;
}

interface EvaluationState {
  operations: number;
  readonly active: Set<string>;
}

interface ReturnSignal {
  readonly returned: true;
  readonly value: RuntimeValue;
}

const isCallable = (value: RuntimeValue): value is CallableValue =>
  typeof value === 'object' && value !== null && 'callable' in value;

const known = <T>(value: T, node: Node): EvaluationResult<T> => ({
  known: true,
  value,
  evidence: [evidenceFor(node)],
});

const unknown = (reason: string, node: Node): EvaluationResult<never> => ({
  known: false,
  reason,
  evidence: [evidenceFor(node)],
});

const evidenceFor = (node: Node): EvaluationEvidence => {
  const position = node.getSourceFile().getLineAndColumnAtPos(node.getStart());
  return {
    file: node.getSourceFile().getFilePath(),
    line: position.line,
    column: position.column,
    kind: node.getKindName(),
  };
};

const nodeKey = (node: Node): string =>
  `${node.getSourceFile().getFilePath()}:${node.getStart()}:${node.getEnd()}`;

const literalPropertyName = (node: Node): string | undefined => {
  if (
    node.isKind(SyntaxKind.Identifier) ||
    node.isKind(SyntaxKind.StringLiteral) ||
    node.isKind(SyntaxKind.NumericLiteral)
  ) {
    return node.getText().replace(/^['"]|['"]$/g, '');
  }
  return undefined;
};

const importedDeclaration = (node: import('ts-morph').Identifier): Node | undefined => {
  const localName = node.getText();
  for (const importDeclaration of node.getSourceFile().getImportDeclarations()) {
    const moduleName = importDeclaration.getModuleSpecifierValue().replace(/\?.*$/, '');
    const basePath = moduleName.startsWith('.')
      ? resolve(dirname(node.getSourceFile().getFilePath()), moduleName)
      : undefined;
    const project = node.getSourceFile().getProject();
    const sourceFile =
      importDeclaration.getModuleSpecifierSourceFile() ??
      (basePath
        ? [
            basePath,
            `${basePath}.ts`,
            `${basePath}.tsx`,
            `${basePath}/index.ts`,
            `${basePath}/index.tsx`,
          ]
            .map((candidate) => project.getSourceFile(candidate))
            .find((candidate) => candidate !== undefined)
        : undefined);
    if (!sourceFile) continue;
    for (const namedImport of importDeclaration.getNamedImports()) {
      const importedLocalName = namedImport.getAliasNode()?.getText() ?? namedImport.getName();
      if (importedLocalName !== localName) continue;
      return sourceFile.getExportedDeclarations().get(namedImport.getName())?.[0];
    }
    if (importDeclaration.getDefaultImport()?.getText() === localName)
      return sourceFile.getDefaultExportSymbol()?.getDeclarations()[0];
  }
  return undefined;
};

const sourceDeclaration = (node: import('ts-morph').Identifier): Node | undefined => {
  const sourceFile = node.getSourceFile();
  const name = node.getText();
  return (
    sourceFile.getVariableDeclaration(name) ??
    sourceFile.getFunction(name) ??
    sourceFile.getEnum(name) ??
    sourceFile.getClass(name)
  );
};

const initializerOf = (declaration: Node): Node | undefined => {
  if ('getInitializer' in declaration) {
    return (declaration as { getInitializer(): Node | undefined }).getInitializer();
  }
  return undefined;
};

const cloneRuntime = (value: RuntimeValue): RuntimeValue => {
  if (isCallable(value) || value instanceof RegExp || value === null || typeof value !== 'object')
    return value;
  if (Array.isArray(value)) return value.map(cloneRuntime) as StaticValue[];
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, cloneRuntime(item as RuntimeValue)])
  ) as StaticValue;
};

const truthy = (value: RuntimeValue): boolean => Boolean(value);

export class StaticEvaluator {
  readonly #checker: TypeChecker;
  readonly #maxDepth: number;
  readonly #maxOperations: number;
  readonly #constants: Readonly<Record<string, StaticValue>>;
  readonly #memo = new Map<string, EvaluationResult<RuntimeValue>>();

  constructor(checker: TypeChecker, options: StaticEvaluatorOptions = {}) {
    this.#checker = checker;
    this.#maxDepth = options.maxDepth ?? 64;
    this.#maxOperations = options.maxOperations ?? 20_000;
    this.#constants = options.constants ?? {};
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

  #propertyName(
    node: Node,
    environment: Environment,
    depth: number,
    state: EvaluationState
  ): EvaluationResult<string> {
    const literal = literalPropertyName(node);
    if (literal !== undefined) return known(literal, node);
    const computed = node.asKind(SyntaxKind.ComputedPropertyName)?.getExpression();
    if (!computed) return unknown('unknown computed property name', node);
    const result = this.#evaluate(computed, environment, depth + 1, state);
    return result.known && ['string', 'number'].includes(typeof result.value)
      ? known(String(result.value), node)
      : result.known
        ? unknown('unknown computed property name', node)
        : result;
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
    if (node.isKind(SyntaxKind.RegularExpressionLiteral)) {
      const text = node.getText();
      const separator = text.lastIndexOf('/');
      return known(new RegExp(text.slice(1, separator), text.slice(separator + 1)), node);
    }
    if (node.isKind(SyntaxKind.TrueKeyword)) return known(true, node);
    if (node.isKind(SyntaxKind.FalseKeyword)) return known(false, node);
    if (node.isKind(SyntaxKind.NullKeyword)) return known(null, node);
    if (node.isKind(SyntaxKind.UndefinedKeyword)) return known(undefined, node);

    if (node.isKind(SyntaxKind.Identifier))
      return this.#identifier(node, environment, depth, state);
    if (node.isKind(SyntaxKind.ArrayLiteralExpression))
      return this.#array(node, environment, depth, state);
    if (node.isKind(SyntaxKind.ObjectLiteralExpression))
      return this.#object(node, environment, depth, state);
    if (node.isKind(SyntaxKind.TemplateExpression))
      return this.#template(node, environment, depth, state);
    if (node.isKind(SyntaxKind.PropertyAccessExpression))
      return this.#propertyAccess(node, environment, depth, state);
    if (node.isKind(SyntaxKind.ElementAccessExpression))
      return this.#elementAccess(node, environment, depth, state);
    if (node.isKind(SyntaxKind.BinaryExpression))
      return this.#binary(node, environment, depth, state);
    if (node.isKind(SyntaxKind.ConditionalExpression)) {
      const condition = this.#evaluate(node.getCondition(), environment, depth + 1, state);
      if (!condition.known) return condition;
      return this.#evaluate(
        truthy(condition.value) ? node.getWhenTrue() : node.getWhenFalse(),
        environment,
        depth + 1,
        state
      );
    }
    if (node.isKind(SyntaxKind.PrefixUnaryExpression))
      return this.#unary(node, environment, depth, state);
    if (node.isKind(SyntaxKind.CallExpression)) return this.#call(node, environment, depth, state);
    if (
      node.isKind(SyntaxKind.ArrowFunction) ||
      node.isKind(SyntaxKind.FunctionDeclaration) ||
      node.isKind(SyntaxKind.FunctionExpression)
    )
      return known({ callable: true, node, environment }, node);

    return unknown(`unsupported ${node.getKindName()}`, node);
  }

  #identifier(
    node: import('ts-morph').Identifier,
    environment: Environment,
    depth: number,
    state: EvaluationState
  ): EvaluationResult<RuntimeValue> {
    const name = node.getText();
    if (environment.has(name)) return known(environment.get(name), node);
    if (name === 'undefined') return known(undefined, node);
    if (name === 'NaN') return known(Number.NaN, node);
    if (name === 'Infinity') return known(Number.POSITIVE_INFINITY, node);

    const declaration =
      resolvedDeclaration(node, this.#checker) ??
      importedDeclaration(node) ??
      sourceDeclaration(node);
    if (!declaration) return unknown(`unresolved identifier ${name}`, node);
    if (declaration.isKind(SyntaxKind.EnumMember)) {
      const value = declaration.getValue();
      if (typeof value === 'string' || typeof value === 'number') return known(value, node);
    }
    if (declaration.isKind(SyntaxKind.FunctionDeclaration))
      return known({ callable: true, node: declaration, environment }, node);
    const initializer = initializerOf(declaration);
    return initializer
      ? this.#evaluate(unwrapExpression(initializer), environment, depth + 1, state)
      : unknown(`identifier ${name} has no value initializer`, node);
  }

  #array(
    node: import('ts-morph').ArrayLiteralExpression,
    environment: Environment,
    depth: number,
    state: EvaluationState
  ): EvaluationResult<RuntimeValue> {
    const values: RuntimeValue[] = [];
    for (const element of node.getElements()) {
      if (element.isKind(SyntaxKind.OmittedExpression)) {
        values.push(undefined);
        continue;
      }
      const target = element.isKind(SyntaxKind.SpreadElement) ? element.getExpression() : element;
      const result = this.#evaluate(unwrapExpression(target), environment, depth + 1, state);
      if (!result.known) return result;
      if (element.isKind(SyntaxKind.SpreadElement)) {
        if (!Array.isArray(result.value)) return unknown('array spread is not iterable', element);
        values.push(...result.value.map(cloneRuntime));
      } else {
        values.push(cloneRuntime(result.value));
      }
    }
    return known(values as StaticValue[], node);
  }

  #object(
    node: import('ts-morph').ObjectLiteralExpression,
    environment: Environment,
    depth: number,
    state: EvaluationState
  ): EvaluationResult<RuntimeValue> {
    const value: Record<string, RuntimeValue> = {};
    for (const property of node.getProperties()) {
      if (property.isKind(SyntaxKind.SpreadAssignment)) {
        const spread = this.#evaluate(property.getExpression(), environment, depth + 1, state);
        if (!spread.known) return spread;
        if (
          spread.value === null ||
          typeof spread.value !== 'object' ||
          Array.isArray(spread.value)
        )
          return unknown('object spread did not evaluate to an object', property);
        Object.assign(value, cloneRuntime(spread.value));
        continue;
      }
      if (property.isKind(SyntaxKind.ShorthandPropertyAssignment)) {
        const symbol = property.getValueSymbol();
        const resolved = symbol?.isAlias() ? symbol.getAliasedSymbol() : symbol;
        const declaration = resolved?.getValueDeclaration() ?? resolved?.getDeclarations()[0];
        const initializer = declaration ? initializerOf(declaration) : undefined;
        const item = initializer
          ? this.#evaluate(unwrapExpression(initializer), environment, depth + 1, state)
          : this.#identifier(property.getNameNode(), environment, depth + 1, state);
        if (!item.known) return item;
        value[property.getName()] = cloneRuntime(item.value);
        continue;
      }
      if (
        property.isKind(SyntaxKind.MethodDeclaration) ||
        property.isKind(SyntaxKind.GetAccessor) ||
        property.isKind(SyntaxKind.SetAccessor)
      ) {
        continue;
      }
      if (!property.isKind(SyntaxKind.PropertyAssignment))
        return unknown('unsupported object member', property as Node);
      const name = this.#propertyName(property.getNameNode(), environment, depth, state);
      if (!name.known) return name;
      const item = this.#evaluate(
        unwrapExpression(property.getInitializerOrThrow()),
        environment,
        depth + 1,
        state
      );
      if (!item.known) return item;
      value[name.value] = cloneRuntime(item.value);
    }
    return known(value as StaticValue, node);
  }

  #template(
    node: import('ts-morph').TemplateExpression,
    environment: Environment,
    depth: number,
    state: EvaluationState
  ): EvaluationResult<RuntimeValue> {
    let value = node.getHead().getLiteralText();
    for (const span of node.getTemplateSpans()) {
      const item = this.#evaluate(span.getExpression(), environment, depth + 1, state);
      if (!item.known || isCallable(item.value))
        return unknown('unknown template substitution', span);
      value += String(item.value ?? '') + span.getLiteral().getLiteralText();
    }
    return known(value, node);
  }

  #propertyAccess(
    node: import('ts-morph').PropertyAccessExpression,
    environment: Environment,
    depth: number,
    state: EvaluationState
  ): EvaluationResult<RuntimeValue> {
    const constantName = `${node.getExpression().getText().split('.').at(-1)}.${node.getName()}`;
    if (Object.hasOwn(this.#constants, constantName))
      return known(cloneRuntime(this.#constants[constantName]), node);
    const declaration = resolvedDeclaration(node, this.#checker);
    if (declaration?.isKind(SyntaxKind.EnumMember)) {
      const enumValue = declaration.getValue();
      if (typeof enumValue === 'string' || typeof enumValue === 'number')
        return known(enumValue, node);
      const initializer = declaration.getInitializer();
      if (initializer) return this.#evaluate(initializer, environment, depth + 1, state);
    }

    const base = this.#evaluate(node.getExpression(), environment, depth + 1, state);
    if (!base.known) return base;
    if (base.value === null || base.value === undefined || isCallable(base.value))
      return unknown(`cannot read property ${node.getName()}`, node);
    const object = Object(base.value) as Record<string, RuntimeValue>;
    return known(object[node.getName()], node);
  }

  #elementAccess(
    node: import('ts-morph').ElementAccessExpression,
    environment: Environment,
    depth: number,
    state: EvaluationState
  ): EvaluationResult<RuntimeValue> {
    const base = this.#evaluate(node.getExpression(), environment, depth + 1, state);
    if (!base.known || base.value === null || base.value === undefined || isCallable(base.value))
      return base.known ? unknown('invalid element-access target', node) : base;
    const argument = node.getArgumentExpression();
    if (!argument) return unknown('missing element-access argument', node);
    const key = this.#evaluate(argument, environment, depth + 1, state);
    if (!key.known || !['string', 'number'].includes(typeof key.value))
      return key.known ? unknown('unknown element-access key', node) : key;
    return known((base.value as Record<string, RuntimeValue>)[String(key.value)], node);
  }

  #unary(
    node: import('ts-morph').PrefixUnaryExpression,
    environment: Environment,
    depth: number,
    state: EvaluationState
  ): EvaluationResult<RuntimeValue> {
    const operand = this.#evaluate(node.getOperand(), environment, depth + 1, state);
    if (!operand.known || isCallable(operand.value)) return operand;
    switch (node.getOperatorToken()) {
      case SyntaxKind.PlusToken:
        return known(Number(operand.value), node);
      case SyntaxKind.MinusToken:
        return known(-Number(operand.value), node);
      case SyntaxKind.ExclamationToken:
        return known(!operand.value, node);
      case SyntaxKind.TildeToken:
        return known(~Number(operand.value), node);
      default:
        return unknown('unsupported unary operator', node);
    }
  }

  #binary(
    node: BinaryExpression,
    environment: Environment,
    depth: number,
    state: EvaluationState
  ): EvaluationResult<RuntimeValue> {
    const operator = node.getOperatorToken().getKind();
    const left = this.#evaluate(node.getLeft(), environment, depth + 1, state);
    if (!left.known) return left;
    if (operator === SyntaxKind.AmpersandAmpersandToken && !truthy(left.value)) return left;
    if (operator === SyntaxKind.BarBarToken && truthy(left.value)) return left;
    if (operator === SyntaxKind.QuestionQuestionToken && left.value != null) return left;

    const right = this.#evaluate(node.getRight(), environment, depth + 1, state);
    if (!right.known || isCallable(left.value) || isCallable(right.value)) return right;
    const l = left.value as never;
    const r = right.value as never;
    switch (operator) {
      case SyntaxKind.PlusToken:
        return known((l as number) + (r as number), node);
      case SyntaxKind.MinusToken:
        return known(Number(l) - Number(r), node);
      case SyntaxKind.AsteriskToken:
        return known(Number(l) * Number(r), node);
      case SyntaxKind.SlashToken:
        return known(Number(l) / Number(r), node);
      case SyntaxKind.PercentToken:
        return known(Number(l) % Number(r), node);
      case SyntaxKind.AsteriskAsteriskToken:
        return known(Number(l) ** Number(r), node);
      case SyntaxKind.BarToken:
        return known(Number(l) | Number(r), node);
      case SyntaxKind.AmpersandToken:
        return known(Number(l) & Number(r), node);
      case SyntaxKind.CaretToken:
        return known(Number(l) ^ Number(r), node);
      case SyntaxKind.LessThanLessThanToken:
        return known(Number(l) << Number(r), node);
      case SyntaxKind.GreaterThanGreaterThanToken:
        return known(Number(l) >> Number(r), node);
      case SyntaxKind.GreaterThanGreaterThanGreaterThanToken:
        return known(Number(l) >>> Number(r), node);
      case SyntaxKind.EqualsEqualsToken:
        return known(l == r, node);
      case SyntaxKind.EqualsEqualsEqualsToken:
        return known(l === r, node);
      case SyntaxKind.ExclamationEqualsToken:
        return known(l != r, node);
      case SyntaxKind.ExclamationEqualsEqualsToken:
        return known(l !== r, node);
      case SyntaxKind.LessThanToken:
        return known(l < r, node);
      case SyntaxKind.LessThanEqualsToken:
        return known(l <= r, node);
      case SyntaxKind.GreaterThanToken:
        return known(l > r, node);
      case SyntaxKind.GreaterThanEqualsToken:
        return known(l >= r, node);
      case SyntaxKind.AmpersandAmpersandToken:
      case SyntaxKind.BarBarToken:
      case SyntaxKind.QuestionQuestionToken:
        return right;
      default:
        return unknown(`unsupported binary operator ${node.getOperatorToken().getText()}`, node);
    }
  }

  #call(
    node: CallExpression,
    environment: Environment,
    depth: number,
    state: EvaluationState
  ): EvaluationResult<RuntimeValue> {
    const propertyCall = node.getExpression().asKind(SyntaxKind.PropertyAccessExpression);
    if (propertyCall) {
      const intrinsic = this.#intrinsic(node, propertyCall, environment, depth, state);
      if (intrinsic) return intrinsic;
    }
    const expression = this.#evaluate(node.getExpression(), environment, depth + 1, state);
    if (!expression.known) return expression;
    if (!isCallable(expression.value))
      return unknown('call target is not statically callable', node);
    const args: RuntimeValue[] = [];
    for (const argument of node.getArguments()) {
      const value = this.#evaluate(argument, environment, depth + 1, state);
      if (!value.known) return value;
      args.push(cloneRuntime(value.value));
    }
    return this.#invoke(expression.value, args, depth + 1, state, node);
  }

  #intrinsic(
    call: CallExpression,
    property: import('ts-morph').PropertyAccessExpression,
    environment: Environment,
    depth: number,
    state: EvaluationState
  ): EvaluationResult<RuntimeValue> | undefined {
    const ownerText = property.getExpression().getText();
    const method = property.getName();
    const globalName = `${ownerText}.${method}`;
    const args = call.getArguments();

    if (globalName === 'crypto.randomUUID') return known(undefined, call);

    if (globalName === 'JSON.stringify') {
      const value = args[0]
        ? this.#evaluate(args[0], environment, depth + 1, state)
        : known(undefined, call);
      return value.known && !isCallable(value.value)
        ? known(JSON.stringify(value.value), call)
        : value;
    }
    if (ownerText === 'Object' && ['keys', 'values', 'entries'].includes(method)) {
      const value = args[0] ? this.#evaluate(args[0], environment, depth + 1, state) : undefined;
      if (
        !value?.known ||
        value.value === null ||
        typeof value.value !== 'object' ||
        isCallable(value.value)
      )
        return value?.known ? unknown(`${globalName} expects an object`, call) : value;
      if (method === 'keys') return known(Object.keys(value.value), call);
      if (method === 'values') return known(Object.values(value.value), call);
      return known(Object.entries(value.value), call);
    }
    if (globalName === 'Object.assign') {
      const output: Record<string, RuntimeValue> = {};
      for (const arg of args) {
        const value = this.#evaluate(arg, environment, depth + 1, state);
        if (
          !value.known ||
          value.value === null ||
          typeof value.value !== 'object' ||
          isCallable(value.value)
        )
          return value.known ? unknown('Object.assign expects objects', arg) : value;
        Object.assign(output, cloneRuntime(value.value));
      }
      return known(output as StaticValue, call);
    }
    if (globalName === 'Object.fromEntries') {
      const value = args[0] ? this.#evaluate(args[0], environment, depth + 1, state) : undefined;
      if (!value?.known || !Array.isArray(value.value))
        return value?.known ? unknown('Object.fromEntries expects an array', call) : value;
      const entries = value.value.filter(
        (item): item is readonly [StaticValue, StaticValue] =>
          Array.isArray(item) && item.length >= 2
      );
      if (entries.length !== value.value.length)
        return unknown('invalid Object.fromEntries item', call);
      return known(Object.fromEntries(entries.map(([key, item]) => [String(key), item])), call);
    }
    if (globalName === 'Array.from') {
      const value = args[0] ? this.#evaluate(args[0], environment, depth + 1, state) : undefined;
      if (!value?.known || isCallable(value.value))
        return value?.known ? unknown('Array.from input is not known', call) : value;
      const input = value.value;
      const length =
        typeof input === 'string' || Array.isArray(input)
          ? input.length
          : input && typeof input === 'object' && !isCallable(input)
            ? Number((input as Record<string, RuntimeValue>).length ?? 0)
            : 0;
      const charged = this.#chargeOperations(length, state, call);
      if (!charged.known) return charged;
      let output = Array.from(value.value as Iterable<StaticValue>);
      if (args[1]) {
        const callback = this.#evaluate(args[1], environment, depth + 1, state);
        if (!callback.known || !isCallable(callback.value))
          return callback.known ? unknown('Array.from mapper is not callable', args[1]) : callback;
        const mapped: RuntimeValue[] = [];
        for (let index = 0; index < output.length; index++) {
          const result = this.#invoke(
            callback.value,
            [output[index], index],
            depth + 1,
            state,
            call
          );
          if (!result.known) return result;
          mapped.push(result.value);
        }
        output = mapped as StaticValue[];
      }
      return known(output, call);
    }

    const receiver = this.#evaluate(property.getExpression(), environment, depth + 1, state);
    if (!receiver.known || isCallable(receiver.value)) return receiver.known ? undefined : receiver;
    if (Array.isArray(receiver.value) && ['map', 'filter', 'reduce'].includes(method)) {
      const callback = args[0] ? this.#evaluate(args[0], environment, depth + 1, state) : undefined;
      if (!callback?.known || !isCallable(callback.value))
        return callback?.known ? unknown(`${method} callback is not callable`, call) : callback;
      if (method === 'map' || method === 'filter') {
        const output: RuntimeValue[] = [];
        for (let index = 0; index < receiver.value.length; index++) {
          const result = this.#invoke(
            callback.value,
            [receiver.value[index], index, receiver.value],
            depth + 1,
            state,
            call
          );
          if (!result.known) return result;
          if (method === 'map') output.push(result.value);
          else if (truthy(result.value)) output.push(receiver.value[index]);
        }
        return known(output as StaticValue[], call);
      }
      const initial = args[1]
        ? this.#evaluate(args[1], environment, depth + 1, state)
        : known(receiver.value[0], call);
      if (!initial.known) return initial;
      let accumulator = cloneRuntime(initial.value);
      const start = args[1] ? 0 : 1;
      for (let index = start; index < receiver.value.length; index++) {
        const result = this.#invoke(
          callback.value,
          [accumulator, receiver.value[index], index, receiver.value],
          depth + 1,
          state,
          call
        );
        if (!result.known) return result;
        accumulator = result.value;
      }
      return known(accumulator, call);
    }
    if (Array.isArray(receiver.value) && method === 'join') {
      const separator = args[0]
        ? this.#evaluate(args[0], environment, depth + 1, state)
        : known(',', call);
      return separator.known && typeof separator.value === 'string'
        ? known(receiver.value.join(separator.value), call)
        : separator.known
          ? unknown('Array.join separator is not a string', call)
          : separator;
    }
    if (typeof receiver.value === 'string') {
      const evaluatedArgs: RuntimeValue[] = [];
      for (const arg of args) {
        const result = this.#evaluate(arg, environment, depth + 1, state);
        if (!result.known || isCallable(result.value)) return result;
        evaluatedArgs.push(result.value);
      }
      switch (method) {
        case 'toLowerCase':
          return known(receiver.value.toLowerCase(), call);
        case 'toUpperCase':
          return known(receiver.value.toUpperCase(), call);
        case 'trim':
          return known(receiver.value.trim(), call);
        case 'split':
          return known(receiver.value.split(evaluatedArgs[0] as string | RegExp), call);
        case 'slice':
          return known(
            receiver.value.slice(
              evaluatedArgs[0] as number | undefined,
              evaluatedArgs[1] as number | undefined
            ),
            call
          );
        case 'includes':
          return known(receiver.value.includes(evaluatedArgs[0] as string), call);
        case 'startsWith':
          return known(receiver.value.startsWith(evaluatedArgs[0] as string), call);
        case 'endsWith':
          return known(receiver.value.endsWith(evaluatedArgs[0] as string), call);
      }
    }
    if (receiver.value instanceof RegExp && method === 'test') {
      const argument = args[0]
        ? this.#evaluate(args[0], environment, depth + 1, state)
        : known('', call);
      return argument.known && typeof argument.value === 'string'
        ? known(receiver.value.test(argument.value), call)
        : argument.known
          ? unknown('RegExp.test argument is not a string', call)
          : argument;
    }
    return undefined;
  }

  #invoke(
    callable: CallableValue,
    args: readonly RuntimeValue[],
    depth: number,
    state: EvaluationState,
    callSite: Node
  ): EvaluationResult<RuntimeValue> {
    const environment = new Map(callable.environment);
    const parameters = callable.node.getParameters();
    for (let index = 0; index < parameters.length; index++) {
      const value = args[index];
      const bound = this.#bindParameter(parameters[index], value, environment, depth, state);
      if (!bound.known) return bound;
    }
    const body = callable.node.getBody();
    if (!body) return known(undefined, callSite);
    if (!body.isKind(SyntaxKind.Block)) return this.#evaluate(body, environment, depth + 1, state);
    const result = this.#executeBlock(body, environment, depth + 1, state);
    return result.known ? known(result.value?.value, callSite) : result;
  }

  #bindParameter(
    parameter: ParameterDeclaration,
    input: RuntimeValue,
    environment: Map<string, RuntimeValue>,
    depth: number,
    state: EvaluationState
  ): EvaluationResult<true> {
    let value = input;
    if (value === undefined && parameter.getInitializer()) {
      const fallback = this.#evaluate(
        parameter.getInitializerOrThrow(),
        environment,
        depth + 1,
        state
      );
      if (!fallback.known) return fallback;
      value = fallback.value;
    }
    this.#bindName(parameter.getNameNode(), value, environment);
    return known(true, parameter);
  }

  #bindName(name: BindingName, value: RuntimeValue, environment: Map<string, RuntimeValue>): void {
    if (name.isKind(SyntaxKind.Identifier)) {
      environment.set(name.getText(), value);
      return;
    }
    if (name.isKind(SyntaxKind.ObjectBindingPattern)) {
      const object = value && typeof value === 'object' && !isCallable(value) ? value : {};
      for (const element of name.getElements()) {
        const key = element.getPropertyNameNode()?.getText() ?? element.getName();
        this.#bindName(
          element.getNameNode(),
          (object as Record<string, RuntimeValue>)[key],
          environment
        );
      }
      return;
    }
    const array = Array.isArray(value) ? value : [];
    name.getElements().forEach((element, index) => {
      if (!element.isKind(SyntaxKind.OmittedExpression))
        this.#bindName(element.getNameNode(), array[index], environment);
    });
  }

  #executeBlock(
    block: Block,
    environment: Map<string, RuntimeValue>,
    depth: number,
    state: EvaluationState
  ): EvaluationResult<ReturnSignal | undefined> {
    for (const statement of block.getStatements()) {
      const result = this.#executeStatement(statement, environment, depth + 1, state);
      if (!result.known || result.value?.returned) return result;
    }
    return known(undefined, block);
  }

  #executeStatement(
    statement: Statement,
    environment: Map<string, RuntimeValue>,
    depth: number,
    state: EvaluationState
  ): EvaluationResult<ReturnSignal | undefined> {
    if (statement.isKind(SyntaxKind.ReturnStatement)) {
      const expression = statement.getExpression();
      const result = expression
        ? this.#evaluate(expression, environment, depth + 1, state)
        : known(undefined, statement);
      return result.known ? known({ returned: true, value: result.value }, statement) : result;
    }
    if (statement.isKind(SyntaxKind.VariableStatement)) {
      for (const declaration of statement.getDeclarations()) {
        const initializer = declaration.getInitializer();
        const result = initializer
          ? this.#evaluate(initializer, environment, depth + 1, state)
          : known(undefined, declaration);
        if (!result.known) return result;
        this.#bindName(declaration.getNameNode(), result.value, environment);
      }
      return known(undefined, statement);
    }
    if (statement.isKind(SyntaxKind.ExpressionStatement)) {
      const expression = statement.getExpression();
      if (
        expression.isKind(SyntaxKind.BinaryExpression) &&
        expression.getOperatorToken().isKind(SyntaxKind.EqualsToken)
      ) {
        const right = this.#evaluate(expression.getRight(), environment, depth + 1, state);
        if (!right.known) return right;
        const assigned = this.#assign(expression.getLeft(), right.value, environment, depth, state);
        return assigned.known ? known(undefined, statement) : assigned;
      }
      const result = this.#evaluate(expression, environment, depth + 1, state);
      return result.known ? known(undefined, statement) : result;
    }
    if (statement.isKind(SyntaxKind.IfStatement)) {
      const condition = this.#evaluate(statement.getExpression(), environment, depth + 1, state);
      if (!condition.known) return condition;
      const branch = truthy(condition.value)
        ? statement.getThenStatement()
        : statement.getElseStatement();
      if (!branch) return known(undefined, statement);
      if (branch.isKind(SyntaxKind.Block))
        return this.#executeBlock(branch, environment, depth + 1, state);
      return this.#executeStatement(branch, environment, depth + 1, state);
    }
    return unknown(`unsupported statement ${statement.getKindName()}`, statement);
  }

  #assign(
    target: Node,
    value: RuntimeValue,
    environment: Map<string, RuntimeValue>,
    depth: number,
    state: EvaluationState
  ): EvaluationResult<true> {
    if (target.isKind(SyntaxKind.Identifier)) {
      environment.set(target.getText(), value);
      return known(true, target);
    }
    const property = target.asKind(SyntaxKind.PropertyAccessExpression);
    const element = target.asKind(SyntaxKind.ElementAccessExpression);
    const baseNode = property?.getExpression() ?? element?.getExpression();
    if (!baseNode) return unknown('unsupported assignment target', target);
    const base = this.#evaluate(baseNode, environment, depth + 1, state);
    if (
      !base.known ||
      base.value === null ||
      typeof base.value !== 'object' ||
      isCallable(base.value)
    )
      return base.known ? unknown('invalid assignment target', target) : base;
    const keyResult = property
      ? known(property.getName(), property)
      : this.#evaluate(
          element?.getArgumentExpressionOrThrow() as Expression,
          environment,
          depth + 1,
          state
        );
    if (!keyResult.known || !['string', 'number'].includes(typeof keyResult.value))
      return keyResult.known ? unknown('invalid assignment key', target) : keyResult;
    (base.value as Record<string, RuntimeValue>)[String(keyResult.value)] = value;
    return known(true, target);
  }
}

export const createStaticEvaluator = (
  checker: TypeChecker,
  options?: StaticEvaluatorOptions
): StaticEvaluator => new StaticEvaluator(checker, options);
