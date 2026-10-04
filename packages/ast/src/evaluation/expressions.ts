import { type BinaryExpression, type Node, SyntaxKind } from 'ts-morph';
import { unwrapExpression } from '../nodes.js';
import { evaluateIdentifier, evaluatePropertyName, initializerOf } from './references.js';
import {
  cloneRuntime,
  type Environment,
  type EvaluationContext,
  type EvaluationResult,
  type EvaluationState,
  isCallable,
  known,
  type RuntimeValue,
  type StaticValue,
  unknown,
} from './runtime.js';

// Construct values and evaluate operators using the caller's shared budget
export function evaluateArray(
  context: EvaluationContext,
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
    const result = context.evaluate(unwrapExpression(target), environment, depth + 1, state);
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

export function evaluateObject(
  context: EvaluationContext,
  node: import('ts-morph').ObjectLiteralExpression,
  environment: Environment,
  depth: number,
  state: EvaluationState
): EvaluationResult<RuntimeValue> {
  const value: Record<string, RuntimeValue> = {};
  for (const property of node.getProperties()) {
    if (property.isKind(SyntaxKind.SpreadAssignment)) {
      const spread = context.evaluate(property.getExpression(), environment, depth + 1, state);
      if (!spread.known) return spread;
      if (spread.value === null || typeof spread.value !== 'object' || Array.isArray(spread.value))
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
        ? context.evaluate(unwrapExpression(initializer), environment, depth + 1, state)
        : evaluateIdentifier(context, property.getNameNode(), environment, depth + 1, state);
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
    const name = evaluatePropertyName(context, property.getNameNode(), environment, depth, state);
    if (!name.known) return name;
    const item = context.evaluate(
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

export function evaluateTemplate(
  context: EvaluationContext,
  node: import('ts-morph').TemplateExpression,
  environment: Environment,
  depth: number,
  state: EvaluationState
): EvaluationResult<RuntimeValue> {
  let value = node.getHead().getLiteralText();
  for (const span of node.getTemplateSpans()) {
    const item = context.evaluate(span.getExpression(), environment, depth + 1, state);
    if (!item.known || isCallable(item.value))
      return unknown('unknown template substitution', span);
    value += String(item.value ?? '') + span.getLiteral().getLiteralText();
  }
  return known(value, node);
}

export function evaluateUnary(
  context: EvaluationContext,
  node: import('ts-morph').PrefixUnaryExpression,
  environment: Environment,
  depth: number,
  state: EvaluationState
): EvaluationResult<RuntimeValue> {
  const operand = context.evaluate(node.getOperand(), environment, depth + 1, state);
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

export function evaluateBinary(
  context: EvaluationContext,
  node: BinaryExpression,
  environment: Environment,
  depth: number,
  state: EvaluationState
): EvaluationResult<RuntimeValue> {
  const operator = node.getOperatorToken().getKind();
  const left = context.evaluate(node.getLeft(), environment, depth + 1, state);
  if (!left.known) return left;
  if (operator === SyntaxKind.AmpersandAmpersandToken && !Boolean(left.value)) return left;
  if (operator === SyntaxKind.BarBarToken && Boolean(left.value)) return left;
  if (operator === SyntaxKind.QuestionQuestionToken && left.value != null) return left;

  const right = context.evaluate(node.getRight(), environment, depth + 1, state);
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
