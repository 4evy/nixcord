import {
  type BindingName,
  type Block,
  type Expression,
  type Node,
  type ParameterDeclaration,
  type Statement,
  SyntaxKind,
} from 'ts-morph';
import {
  type CallableValue,
  type EvaluationContext,
  type EvaluationResult,
  type EvaluationState,
  isCallable,
  known,
  type RuntimeValue,
  unknown,
} from './runtime.js';

// Invoke captured environments and execute the supported statement subset
interface ReturnSignal {
  readonly returned: true;
  readonly value: RuntimeValue;
}

export function invokeCallable(
  context: EvaluationContext,
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
    const bound = bindParameter(context, parameters[index], value, environment, depth, state);
    if (!bound.known) return bound;
  }
  const body = callable.node.getBody();
  if (!body) return known(undefined, callSite);
  if (!body.isKind(SyntaxKind.Block)) return context.evaluate(body, environment, depth + 1, state);
  const result = executeBlock(context, body, environment, depth + 1, state);
  return result.known ? known(result.value?.value, callSite) : result;
}

function bindParameter(
  context: EvaluationContext,
  parameter: ParameterDeclaration,
  input: RuntimeValue,
  environment: Map<string, RuntimeValue>,
  depth: number,
  state: EvaluationState
): EvaluationResult<true> {
  let value = input;
  if (value === undefined && parameter.getInitializer()) {
    const fallback = context.evaluate(
      parameter.getInitializerOrThrow(),
      environment,
      depth + 1,
      state
    );
    if (!fallback.known) return fallback;
    value = fallback.value;
  }
  bindName(parameter.getNameNode(), value, environment);
  return known(true, parameter);
}

function bindName(
  name: BindingName,
  value: RuntimeValue,
  environment: Map<string, RuntimeValue>
): void {
  if (name.isKind(SyntaxKind.Identifier)) {
    environment.set(name.getText(), value);
    return;
  }
  if (name.isKind(SyntaxKind.ObjectBindingPattern)) {
    const object = value && typeof value === 'object' && !isCallable(value) ? value : {};
    for (const element of name.getElements()) {
      const key = element.getPropertyNameNode()?.getText() ?? element.getName();
      bindName(element.getNameNode(), (object as Record<string, RuntimeValue>)[key], environment);
    }
    return;
  }
  const array = Array.isArray(value) ? value : [];
  name.getElements().forEach((element, index) => {
    if (!element.isKind(SyntaxKind.OmittedExpression))
      bindName(element.getNameNode(), array[index], environment);
  });
}

function executeBlock(
  context: EvaluationContext,
  block: Block,
  environment: Map<string, RuntimeValue>,
  depth: number,
  state: EvaluationState
): EvaluationResult<ReturnSignal | undefined> {
  for (const statement of block.getStatements()) {
    const result = executeStatement(context, statement, environment, depth + 1, state);
    if (!result.known || result.value?.returned) return result;
  }
  return known(undefined, block);
}

function executeStatement(
  context: EvaluationContext,
  statement: Statement,
  environment: Map<string, RuntimeValue>,
  depth: number,
  state: EvaluationState
): EvaluationResult<ReturnSignal | undefined> {
  if (statement.isKind(SyntaxKind.ReturnStatement)) {
    const expression = statement.getExpression();
    const result = expression
      ? context.evaluate(expression, environment, depth + 1, state)
      : known(undefined, statement);
    return result.known ? known({ returned: true, value: result.value }, statement) : result;
  }
  if (statement.isKind(SyntaxKind.VariableStatement)) {
    for (const declaration of statement.getDeclarations()) {
      const initializer = declaration.getInitializer();
      const result = initializer
        ? context.evaluate(initializer, environment, depth + 1, state)
        : known(undefined, declaration);
      if (!result.known) return result;
      bindName(declaration.getNameNode(), result.value, environment);
    }
    return known(undefined, statement);
  }
  if (statement.isKind(SyntaxKind.ExpressionStatement)) {
    const expression = statement.getExpression();
    if (
      expression.isKind(SyntaxKind.BinaryExpression) &&
      expression.getOperatorToken().isKind(SyntaxKind.EqualsToken)
    ) {
      const right = context.evaluate(expression.getRight(), environment, depth + 1, state);
      if (!right.known) return right;
      const assigned = assign(
        context,
        expression.getLeft(),
        right.value,
        environment,
        depth,
        state
      );
      return assigned.known ? known(undefined, statement) : assigned;
    }
    const result = context.evaluate(expression, environment, depth + 1, state);
    return result.known ? known(undefined, statement) : result;
  }
  if (statement.isKind(SyntaxKind.IfStatement)) {
    const condition = context.evaluate(statement.getExpression(), environment, depth + 1, state);
    if (!condition.known) return condition;
    const branch = Boolean(condition.value)
      ? statement.getThenStatement()
      : statement.getElseStatement();
    if (!branch) return known(undefined, statement);
    if (branch.isKind(SyntaxKind.Block))
      return executeBlock(context, branch, environment, depth + 1, state);
    return executeStatement(context, branch, environment, depth + 1, state);
  }
  return unknown(`unsupported statement ${statement.getKindName()}`, statement);
}

function assign(
  context: EvaluationContext,
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
  const base = context.evaluate(baseNode, environment, depth + 1, state);
  if (
    !base.known ||
    base.value === null ||
    typeof base.value !== 'object' ||
    isCallable(base.value)
  )
    return base.known ? unknown('invalid assignment target', target) : base;
  const keyResult = property
    ? known(property.getName(), property)
    : context.evaluate(
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
