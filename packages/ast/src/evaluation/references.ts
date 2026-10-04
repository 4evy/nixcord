import { Node, SyntaxKind } from 'ts-morph';
import { resolvedDeclaration, unwrapExpression } from '../nodes.js';
import {
  cloneRuntime,
  type Environment,
  type EvaluationContext,
  type EvaluationResult,
  type EvaluationState,
  isCallable,
  known,
  type RuntimeValue,
  unknown,
} from './runtime.js';

// Resolve lexical names and property reads without owning recursion or caches
const literalPropertyName = (node: Node): string | undefined => {
  if (node.isKind(SyntaxKind.StringLiteral) || node.isKind(SyntaxKind.NumericLiteral))
    return String(node.getLiteralValue());
  if (node.isKind(SyntaxKind.Identifier)) return node.getText();
  return undefined;
};

export const initializerOf = (declaration: Node): Node | undefined => {
  if (declaration.isKind(SyntaxKind.ExportAssignment)) return declaration.getExpression();
  if (Node.isExpression(declaration)) return declaration;
  if (Node.isInitializerExpressionGetable(declaration)) return declaration.getInitializer();
  return undefined;
};

export function evaluatePropertyName(
  context: EvaluationContext,
  node: Node,
  environment: Environment,
  depth: number,
  state: EvaluationState
): EvaluationResult<string> {
  const literal = literalPropertyName(node);
  if (literal !== undefined) return known(literal, node);
  const computed = node.asKind(SyntaxKind.ComputedPropertyName)?.getExpression();
  if (!computed) return unknown('unknown computed property name', node);
  const result = context.evaluate(computed, environment, depth + 1, state);
  return result.known && ['string', 'number'].includes(typeof result.value)
    ? known(String(result.value), node)
    : result.known
      ? unknown('unknown computed property name', node)
      : result;
}

export function evaluateIdentifier(
  context: EvaluationContext,
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

  const declaration = resolvedDeclaration(node, context.checker);
  if (declaration) {
    if (declaration.isKind(SyntaxKind.EnumMember)) {
      const value = declaration.getValue();
      if (typeof value === 'string' || typeof value === 'number') return known(value, node);
    }
    if (declaration.isKind(SyntaxKind.FunctionDeclaration))
      return known({ callable: true, node: declaration, environment }, node);
    const initializer = initializerOf(declaration);
    if (initializer)
      return context.evaluate(unwrapExpression(initializer), environment, depth + 1, state);
  }
  return unknown(
    declaration ? `identifier ${name} has no value initializer` : `unresolved identifier ${name}`,
    node
  );
}

export function evaluatePropertyAccess(
  context: EvaluationContext,
  node: import('ts-morph').PropertyAccessExpression,
  environment: Environment,
  depth: number,
  state: EvaluationState
): EvaluationResult<RuntimeValue> {
  const constantName = `${node.getExpression().getText().split('.').at(-1)}.${node.getName()}`;
  if (Object.hasOwn(context.constants, constantName))
    return known(cloneRuntime(context.constants[constantName]), node);
  const declaration = resolvedDeclaration(node, context.checker);
  if (declaration?.isKind(SyntaxKind.EnumMember)) {
    const enumValue = declaration.getValue();
    if (typeof enumValue === 'string' || typeof enumValue === 'number')
      return known(enumValue, node);
    const initializer = declaration.getInitializer();
    if (initializer) return context.evaluate(initializer, environment, depth + 1, state);
  }

  const base = context.evaluate(node.getExpression(), environment, depth + 1, state);
  if (!base.known) return base;
  if (base.value === null || base.value === undefined || isCallable(base.value))
    return unknown(`cannot read property ${node.getName()}`, node);
  const object = Object(base.value) as Record<string, RuntimeValue>;
  return known(object[node.getName()], node);
}

export function evaluateElementAccess(
  context: EvaluationContext,
  node: import('ts-morph').ElementAccessExpression,
  environment: Environment,
  depth: number,
  state: EvaluationState
): EvaluationResult<RuntimeValue> {
  const base = context.evaluate(node.getExpression(), environment, depth + 1, state);
  if (!base.known || base.value === null || base.value === undefined || isCallable(base.value))
    return base.known ? unknown('invalid element-access target', node) : base;
  const argument = node.getArgumentExpression();
  if (!argument) return unknown('missing element-access argument', node);
  const key = context.evaluate(argument, environment, depth + 1, state);
  if (!key.known || !['string', 'number'].includes(typeof key.value))
    return key.known ? unknown('unknown element-access key', node) : key;
  return known((base.value as Record<string, RuntimeValue>)[String(key.value)], node);
}
