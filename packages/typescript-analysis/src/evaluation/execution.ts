import {
  type BindingName,
  type Block,
  type Expression,
  type Node,
  type ParameterDeclaration,
  type Statement,
  SyntaxKind,
} from '../ast.js';
import { evaluatePropertyName } from './references.js';
import {
  type CallableValue,
  type EvaluationContext,
  type EvaluationResult,
  type EvaluationState,
  isCallable,
  known,
  type RuntimeValue,
  type StaticValue,
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
    const value = parameters[index].isRestParameter()
      ? (args.slice(index) as StaticValue[])
      : args[index];
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
  return bindName(context, parameter.getNameNode(), value, environment, depth, state);
}

function bindName(
  context: EvaluationContext,
  name: BindingName,
  value: RuntimeValue,
  environment: Map<string, RuntimeValue>,
  depth: number,
  state: EvaluationState
): EvaluationResult<true> {
  if (name.isKind(SyntaxKind.Identifier)) {
    environment.set(name.getText(), value);
    return known(true, name);
  }
  if (value == null || isCallable(value)) return unknown('invalid destructuring target', name);
  const bindElement = (element: import('../ast.js').BindingElement, input: RuntimeValue) => {
    const initializer = element.getInitializer();
    if (input === undefined && initializer) {
      const fallback = context.evaluate(initializer, environment, depth + 1, state);
      if (!fallback.known) return fallback;
      input = fallback.value;
    }
    return bindName(context, element.getNameNode(), input, environment, depth + 1, state);
  };
  if (name.isKind(SyntaxKind.ObjectBindingPattern)) {
    const object = Object(value) as Record<string, RuntimeValue>;
    const excluded = new Set<string>();
    for (const element of name.getElements()) {
      let input: RuntimeValue;
      if (element.getDotDotDotToken()) {
        input = Object.fromEntries(
          Object.entries(object).filter(([key]) => !excluded.has(key))
        ) as StaticValue;
      } else {
        const key = evaluatePropertyName(
          context,
          element.getPropertyNameNode() ?? element.getNameNode(),
          environment,
          depth,
          state
        );
        if (!key.known) return key;
        excluded.add(key.value);
        input = object[key.value];
      }
      const bound = bindElement(element, input);
      if (!bound.known) return bound;
    }
    return known(true, name);
  }
  if (!name.isKind(SyntaxKind.ArrayBindingPattern))
    return unknown('unsupported binding name', name);
  if (!Array.isArray(value) && typeof value !== 'string')
    return unknown('destructuring target is not iterable', name);
  const charged = context.chargeOperations(value.length, state, name);
  if (!charged.known) return charged;
  const array = Array.from(value as Iterable<StaticValue>);
  for (const [index, element] of name.getElements().entries()) {
    if (element.isKind(SyntaxKind.OmittedExpression)) continue;
    const bound = bindElement(
      element,
      element.getDotDotDotToken() ? array.slice(index) : array[index]
    );
    if (!bound.known) return bound;
  }
  return known(true, name);
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
      const bound = bindName(
        context,
        declaration.getNameNode(),
        result.value,
        environment,
        depth,
        state
      );
      if (!bound.known) return bound;
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
