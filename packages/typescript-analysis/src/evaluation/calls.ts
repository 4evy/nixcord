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
  const args = evaluateArguments({ context, call: node, environment, depth, state });
  if (!args.known) return args;
  return invokeCallable(context, expression.value, args.value, depth + 1, state, node);
}

type IntrinsicScope = {
  context: EvaluationContext;
  call: CallExpression;
  environment: Environment;
  depth: number;
  state: EvaluationState;
};

function evaluateArguments(scope: IntrinsicScope): EvaluationResult<RuntimeValue[]> {
  const { context, call, environment, depth, state } = scope;
  const args: RuntimeValue[] = [];
  for (const argument of call.getArguments()) {
    const spread = argument.isKind(SyntaxKind.SpreadElement);
    const value = context.evaluate(
      spread ? argument.getExpression() : argument,
      environment,
      depth + 1,
      state
    );
    if (!value.known) return value;
    if (spread) {
      if (!Array.isArray(value.value) && typeof value.value !== 'string')
        return unknown('call spread is not iterable', argument);
      const charged = context.chargeOperations(value.value.length, state, argument);
      if (!charged.known) return charged;
      for (const item of value.value) args.push(cloneRuntime(item));
    } else {
      args.push(cloneRuntime(value.value));
    }
  }
  return known(args, call);
}

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
  if (globalName === 'crypto.randomUUID')
    return unknown('crypto.randomUUID is not deterministic', call);
  // Cloning native arguments cannot reproduce mutations visible to later
  // statements or aliases, so do not treat Object.assign as a pure intrinsic
  if (globalName === 'Object.assign')
    return unknown('Object.assign mutation is not supported', call);

  const scope = { context, call, environment, depth, state };
  if (globalName === 'JSON.stringify') return evaluateNative(scope, JSON.stringify, JSON);
  if (
    globalOwner &&
    ownerText === 'Object' &&
    ['keys', 'values', 'entries', 'fromEntries'].includes(method)
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
  if (receiver.value instanceof RegExp && method === 'test') {
    if (receiver.value.global || receiver.value.sticky)
      return unknown('stateful RegExp.test is not supported', call);
    return evaluateNative(scope, RegExp.prototype.test, receiver.value);
  }
  return undefined;
}

// Only whitelisted intrinsics reach native JavaScript; source callbacks stay
// inside the evaluator so they retain its operation and recursion budgets
function evaluateNative(
  scope: IntrinsicScope,
  callable: (...args: never[]) => unknown,
  receiver: unknown
): EvaluationResult<RuntimeValue> {
  const args = evaluateArguments(scope);
  if (!args.known) return args;
  if (args.value.some(isCallable)) return unknown('native callback is not supported', scope.call);
  return known(Reflect.apply(callable, receiver, args.value) as RuntimeValue, scope.call);
}

function evaluateArrayFrom(scope: IntrinsicScope): EvaluationResult<RuntimeValue> | undefined {
  const { context, call, depth, state } = scope;
  const args = evaluateArguments(scope);
  if (!args.known) return args;
  const input = args.value[0];
  if (input == null || isCallable(input)) return unknown('Array.from input is not known', call);
  if (args.value[2] !== undefined) return unknown('Array.from thisArg is not supported', call);
  const length =
    typeof input === 'string' || Array.isArray(input)
      ? input.length
      : typeof input === 'object'
        ? Math.max(
            0,
            Math.min(
              Math.trunc(Number((input as Record<string, RuntimeValue>).length ?? 0)) || 0,
              Number.MAX_SAFE_INTEGER
            )
          )
        : 0;
  const charged = context.chargeOperations(length, state, call);
  if (!charged.known) return charged;
  let output = Array.from(input as Iterable<StaticValue>);
  if (args.value[1] !== undefined) {
    const callback = args.value[1];
    if (!isCallable(callback)) return unknown('Array.from mapper is not callable', call);
    const mapped: RuntimeValue[] = [];
    for (let index = 0; index < output.length; index++) {
      const result = invokeCallable(
        context,
        callback,
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
  const { context, call, depth, state } = scope;
  const args = evaluateArguments(scope);
  if (!args.known) return args;
  const callable = args.value[0];
  if (!isCallable(callable)) return unknown(`${method} callback is not callable`, call);
  if (method !== 'reduce' && args.value[1] !== undefined)
    return unknown(`${method} thisArg is not supported`, call);
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
  if (method === 'reduce' && args.value.length > 1) nativeArgs.push(args.value[1]);
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
