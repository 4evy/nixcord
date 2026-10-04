import { type CallExpression, SyntaxKind } from 'ts-morph';
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
    const intrinsic = evaluateIntrinsic(context, node, propertyCall, environment, depth, state);
    if (intrinsic) return intrinsic;
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

function evaluateIntrinsic(
  context: EvaluationContext,
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
      ? context.evaluate(args[0], environment, depth + 1, state)
      : known(undefined, call);
    return value.known && !isCallable(value.value)
      ? known(JSON.stringify(value.value), call)
      : value;
  }
  if (ownerText === 'Object' && ['keys', 'values', 'entries'].includes(method)) {
    const value = args[0] ? context.evaluate(args[0], environment, depth + 1, state) : undefined;
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
      const value = context.evaluate(arg, environment, depth + 1, state);
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
    const value = args[0] ? context.evaluate(args[0], environment, depth + 1, state) : undefined;
    if (!value?.known || !Array.isArray(value.value))
      return value?.known ? unknown('Object.fromEntries expects an array', call) : value;
    const entries = value.value.filter(
      (item): item is readonly [StaticValue, StaticValue] => Array.isArray(item) && item.length >= 2
    );
    if (entries.length !== value.value.length)
      return unknown('invalid Object.fromEntries item', call);
    return known(Object.fromEntries(entries.map(([key, item]) => [String(key), item])), call);
  }
  if (globalName === 'Array.from') {
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

  const receiver = context.evaluate(property.getExpression(), environment, depth + 1, state);
  if (!receiver.known || isCallable(receiver.value)) return receiver.known ? undefined : receiver;
  if (Array.isArray(receiver.value) && ['map', 'filter', 'reduce'].includes(method)) {
    const callback = args[0] ? context.evaluate(args[0], environment, depth + 1, state) : undefined;
    if (!callback?.known || !isCallable(callback.value))
      return callback?.known ? unknown(`${method} callback is not callable`, call) : callback;
    if (method === 'map' || method === 'filter') {
      const output: RuntimeValue[] = [];
      for (let index = 0; index < receiver.value.length; index++) {
        const result = invokeCallable(
          context,
          callback.value,
          [receiver.value[index], index, receiver.value],
          depth + 1,
          state,
          call
        );
        if (!result.known) return result;
        if (method === 'map') output.push(result.value);
        else if (Boolean(result.value)) output.push(receiver.value[index]);
      }
      return known(output as StaticValue[], call);
    }
    const initial = args[1]
      ? context.evaluate(args[1], environment, depth + 1, state)
      : known(receiver.value[0], call);
    if (!initial.known) return initial;
    let accumulator = cloneRuntime(initial.value);
    const start = args[1] ? 0 : 1;
    for (let index = start; index < receiver.value.length; index++) {
      const result = invokeCallable(
        context,
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
      ? context.evaluate(args[0], environment, depth + 1, state)
      : known(',', call);
    return separator.known && typeof separator.value === 'string'
      ? known(receiver.value.join(separator.value), call)
      : separator.known
        ? unknown('Array.join separator is not a string', call)
        : separator;
  }
  if (typeof receiver.value === 'string' && STRING_METHODS.has(method)) {
    const evaluatedArgs: RuntimeValue[] = [];
    for (const arg of args) {
      const result = context.evaluate(arg, environment, depth + 1, state);
      if (!result.known || isCallable(result.value)) return result;
      evaluatedArgs.push(result.value);
    }
    return known(
      Reflect.apply(Reflect.get(String.prototype, method), receiver.value, evaluatedArgs),
      call
    );
  }

  if (receiver.value instanceof RegExp && method === 'test') {
    const argument = args[0]
      ? context.evaluate(args[0], environment, depth + 1, state)
      : known('', call);
    return argument.known && typeof argument.value === 'string'
      ? known(receiver.value.test(argument.value), call)
      : argument.known
        ? unknown('RegExp.test argument is not a string', call)
        : argument;
  }
  return undefined;
}
