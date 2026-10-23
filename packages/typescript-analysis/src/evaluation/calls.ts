import { type CallExpression, SyntaxKind } from '../ast.js';
import { resolvedDeclaration } from '../nodes.js';
import { invokeCallable } from './execution.js';
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

// Dispatch calls and supported intrinsics while preserving callback evaluation order
const STRING_METHODS = new Set([
  'toLowerCase',
  'toUpperCase',
  'trim',
  'split',
  'slice',
  'includes',
  'startsWith',
  'endsWith',
]);

export function evaluateCall(
  context: EvaluationContext,
  node: CallExpression,
  environment: Environment,
  depth: number,
  state: EvaluationState
): EvaluationResult<RuntimeValue> {
  const propertyCall = node.getExpression().asKind(SyntaxKind.PropertyAccessExpression);
  if (propertyCall) {
    try {
      const intrinsic = evaluateIntrinsic(context, node, propertyCall, environment, depth, state);
      if (intrinsic) return intrinsic;
    } catch (error) {
      return unknown(error instanceof Error ? error.message : String(error), node);
    }
  }
  const expression = context.evaluate(node.getExpression(), environment, depth + 1, state);
  if (!expression.known) return expression;
  if (!isCallable(expression.value)) return unknown('call target is not statically callable', node);
  const args: RuntimeValue[] = [];
  for (const argument of node.getArguments()) {
    const value = context.evaluate(argument, environment, depth + 1, state);
    if (!value.known) return value;
    args.push(cloneRuntime(value.value));
  }
  return invokeCallable(context, expression.value, args, depth + 1, state, node);
}

type IntrinsicScope = {
  context: EvaluationContext;
  call: CallExpression;
  environment: Environment;
  depth: number;
  state: EvaluationState;
};

function evaluateIntrinsic(
  context: EvaluationContext,
  call: CallExpression,
  property: import('../ast.js').PropertyAccessExpression,
  environment: Environment,
  depth: number,
  state: EvaluationState
): EvaluationResult<RuntimeValue> | undefined {
  const ownerText = property.getExpression().getText();
  const method = property.getName();
  const owner = property.getExpression();
  const declaration = resolvedDeclaration(owner, context.checker);
  const globalOwner =
    !environment.has(ownerText) &&
    (!declaration ||
      declaration.view.defaultLibraries.has(declaration.getSourceFile().getFilePath()));
  const globalName = globalOwner ? `${ownerText}.${method}` : '';
  if (globalName === 'crypto.randomUUID') return known(undefined, call);

  const scope = { context, call, environment, depth, state };
  if (globalName === 'JSON.stringify') return evaluateNative(scope, JSON.stringify, JSON);
  if (
    globalOwner &&
    ownerText === 'Object' &&
    ['keys', 'values', 'entries', 'assign', 'fromEntries'].includes(method)
  )
    return evaluateNative(scope, Reflect.get(Object, method), Object);
  if (globalName === 'Array.from') return evaluateArrayFrom(scope);

  const receiver = context.evaluate(property.getExpression(), environment, depth + 1, state);
  if (!receiver.known || isCallable(receiver.value)) return receiver.known ? undefined : receiver;
  if (Array.isArray(receiver.value) && ['map', 'filter', 'reduce'].includes(method))
    return evaluateArrayMethod(scope, receiver.value, method);
  if (Array.isArray(receiver.value) && method === 'join')
    return evaluateNative(scope, Array.prototype.join, receiver.value);
  if (typeof receiver.value === 'string' && STRING_METHODS.has(method))
    return evaluateNative(scope, Reflect.get(String.prototype, method), receiver.value);
  if (receiver.value instanceof RegExp && method === 'test')
    return evaluateNative(scope, RegExp.prototype.test, receiver.value);
  return undefined;
}

// Only whitelisted intrinsics reach native JavaScript; source callbacks stay
// inside the evaluator so they retain its operation and recursion budgets
function evaluateNative(
  scope: IntrinsicScope,
  callable: (...args: never[]) => unknown,
  receiver: unknown
): EvaluationResult<RuntimeValue> {
  const { context, call, environment, depth, state } = scope;
  const args: RuntimeValue[] = [];
  for (const arg of call.getArguments()) {
    const value = context.evaluate(arg, environment, depth + 1, state);
    if (!value.known) return value;
    if (isCallable(value.value)) return unknown('native callback is not supported', arg);
    args.push(cloneRuntime(value.value));
  }
  return known(Reflect.apply(callable, receiver, args) as RuntimeValue, call);
}

function evaluateArrayFrom(scope: IntrinsicScope): EvaluationResult<RuntimeValue> | undefined {
  const { context, call, environment, depth, state } = scope;
  const args = call.getArguments();
  const value = args[0] ? context.evaluate(args[0], environment, depth + 1, state) : undefined;
  if (!value?.known || isCallable(value.value))
    return value?.known ? unknown('Array.from input is not known', call) : value;
  const input = value.value;
  const length =
    typeof input === 'string' || Array.isArray(input)
      ? input.length
      : input && typeof input === 'object' && !isCallable(input)
        ? Number((input as Record<string, RuntimeValue>).length ?? 0)
        : 0;
  const charged = context.chargeOperations(length, state, call);
  if (!charged.known) return charged;
  let output = Array.from(value.value as Iterable<StaticValue>);
  if (args[1]) {
    const callback = context.evaluate(args[1], environment, depth + 1, state);
    if (!callback.known || !isCallable(callback.value))
      return callback.known ? unknown('Array.from mapper is not callable', args[1]) : callback;
    const mapped: RuntimeValue[] = [];
    for (let index = 0; index < output.length; index++) {
      const result = invokeCallable(
        context,
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

function evaluateArrayMethod(
  scope: IntrinsicScope,
  receiver: readonly StaticValue[],
  method: string
): EvaluationResult<RuntimeValue> | undefined {
  const { context, call, environment, depth, state } = scope;
  const args = call.getArguments();
  const callback = args[0] ? context.evaluate(args[0], environment, depth + 1, state) : undefined;
  if (!callback?.known || !isCallable(callback.value))
    return callback?.known ? unknown(`${method} callback is not callable`, call) : callback;
  const callable = callback.value;
  const nativeArgs: unknown[] = [
    (...values: RuntimeValue[]) => {
      const result = invokeCallable(context, callable, values, depth + 1, state, call);
      if (!result.known) {
        failure = result;
        throw result;
      }
      return result.value;
    },
  ];
  let failure: EvaluationResult<never> | undefined;
  if (method === 'reduce' && args[1]) {
    const initial = context.evaluate(args[1], environment, depth + 1, state);
    if (!initial.known) return initial;
    nativeArgs.push(cloneRuntime(initial.value));
  }
  try {
    return known(
      Reflect.apply(Reflect.get(Array.prototype, method), receiver, nativeArgs) as RuntimeValue,
      call
    );
  } catch (error) {
    if (failure) return failure;
    throw error;
  }
}
