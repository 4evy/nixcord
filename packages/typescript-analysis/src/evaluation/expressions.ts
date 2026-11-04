import { type BinaryExpression, type Node, SyntaxKind } from '../ast.js';
import { unwrapExpression } from '../nodes.js';
import { invokeCallable } from './execution.js';
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
  node: import('../ast.js').ArrayLiteralExpression,
  environment: Environment,
  depth: number,
  state: EvaluationState
): EvaluationResult<RuntimeValue> {
  const values: RuntimeValue[] = [];
  for (const element of node.getElements()) {
    if (element.isKind(SyntaxKind.OmittedExpression)) {
      values.length++;
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

function isConstantGetterExpression(node: Node): boolean {
  node = unwrapExpression(node);
  if (
    node.isKind(SyntaxKind.StringLiteral) ||
    node.isKind(SyntaxKind.NoSubstitutionTemplateLiteral) ||
    node.isKind(SyntaxKind.NumericLiteral) ||
    node.isKind(SyntaxKind.TrueKeyword) ||
    node.isKind(SyntaxKind.FalseKeyword) ||
    node.isKind(SyntaxKind.NullKeyword)
  )
    return true;
  if (node.isKind(SyntaxKind.PrefixUnaryExpression))
    return isConstantGetterExpression(node.getOperand());
  if (node.isKind(SyntaxKind.BinaryExpression))
    return (
      isConstantGetterExpression(node.getLeft()) && isConstantGetterExpression(node.getRight())
    );
  if (node.isKind(SyntaxKind.ConditionalExpression))
    return (
      isConstantGetterExpression(node.getCondition()) &&
      isConstantGetterExpression(node.getWhenTrue()) &&
      isConstantGetterExpression(node.getWhenFalse())
    );
  if (node.isKind(SyntaxKind.TemplateExpression))
    return node
      .getTemplateSpans()
      .every((span) => isConstantGetterExpression(span.getExpression()));
  return false;
}

function defineObjectValue(
  object: Record<string, RuntimeValue>,
  name: string,
  value: RuntimeValue
): void {
  if (!Object.getOwnPropertyDescriptor(object, name)?.get) {
    object[name] = value;
    return;
  }
  Object.defineProperty(object, name, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

export function evaluateObject(
  context: EvaluationContext,
  node: import('../ast.js').ObjectLiteralExpression,
  environment: Environment,
  depth: number,
  state: EvaluationState
): EvaluationResult<RuntimeValue> {
  const value: Record<string, RuntimeValue> = {};
  for (const property of node.getProperties()) {
    if (property.isKind(SyntaxKind.SpreadAssignment)) {
      const spread = context.evaluate(property.getExpression(), environment, depth + 1, state);
      if (!spread.known) return spread;
      if (isCallable(spread.value))
        return unknown('object spread of a callable is not supported', property);
      // Object spread copies enumerable keys and treats nullish inputs as empty
      for (const [name, item] of Object.entries(Object(spread.value)))
        defineObjectValue(value, name, cloneRuntime(item as RuntimeValue));
      continue;
    }
    if (property.isKind(SyntaxKind.ShorthandPropertyAssignment)) {
      const symbol = property.getValueSymbol();
      const resolved = symbol?.isAlias() ? symbol.getAliasedSymbol() : symbol;
      const declaration = resolved?.getValueDeclaration() ?? resolved?.getDeclarations()[0];
      const nameNode = property.getNameNode().asKind(SyntaxKind.Identifier);
      if (!nameNode) return unknown('unsupported shorthand property name', property);
      const initializer =
        !environment.has(property.getName()) && declaration
          ? initializerOf(declaration)
          : undefined;
      const item = initializer
        ? context.evaluate(unwrapExpression(initializer), environment, depth + 1, state)
        : evaluateIdentifier(context, nameNode, environment, depth + 1, state);
      if (!item.known) return item;
      defineObjectValue(value, property.getName(), cloneRuntime(item.value));
      continue;
    }
    if (property.isKind(SyntaxKind.SetAccessor))
      return unknown('object setters are not supported', property);
    if (property.isKind(SyntaxKind.GetAccessor) || property.isKind(SyntaxKind.MethodDeclaration)) {
      const name = evaluatePropertyName(context, property.getNameNode(), environment, depth, state);
      if (!name.known) return name;
      const callable = { callable: true as const, node: property, environment };
      if (property.isKind(SyntaxKind.MethodDeclaration)) {
        defineObjectValue(value, name.value, callable);
      } else {
        // Only closed scalar expressions can be materialized without stale
        // captures, effects, or changing object identity across property reads
        const statements = property.getBody()?.getStatements();
        const statement = statements?.length === 1 ? statements[0] : undefined;
        if (!statement?.isKind(SyntaxKind.ReturnStatement))
          return unknown('getter body is not a constant return', property);
        const expression = statement.getExpression();
        if (expression && !isConstantGetterExpression(expression))
          return unknown('getter expression is not a closed scalar constant', property);
        const item = invokeCallable(context, callable, [], depth + 1, state, property);
        if (!item.known) return item;
        Object.defineProperty(value, name.value, {
          get: () => item.value,
          enumerable: true,
          configurable: true,
        });
      }
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
    defineObjectValue(value, name.value, cloneRuntime(item.value));
  }
  return known(value as StaticValue, node);
}

export function evaluateTemplate(
  context: EvaluationContext,
  node: import('../ast.js').TemplateExpression,
  environment: Environment,
  depth: number,
  state: EvaluationState
): EvaluationResult<RuntimeValue> {
  let value = node.getHead().getLiteralText();
  for (const span of node.getTemplateSpans()) {
    const item = context.evaluate(span.getExpression(), environment, depth + 1, state);
    if (!item.known || isCallable(item.value))
      return unknown('unknown template substitution', span);
    value += String(item.value) + span.getLiteral().getLiteralText();
  }
  return known(value, node);
}

export function evaluateUnary(
  context: EvaluationContext,
  node: import('../ast.js').PrefixUnaryExpression,
  environment: Environment,
  depth: number,
  state: EvaluationState
): EvaluationResult<RuntimeValue> {
  const operand = context.evaluate(node.getOperand(), environment, depth + 1, state);
  if (!operand.known || isCallable(operand.value)) return operand;
  switch (node.getUnaryOperator()) {
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
