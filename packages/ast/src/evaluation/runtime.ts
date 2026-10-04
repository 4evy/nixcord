import type {
  ArrowFunction,
  FunctionDeclaration,
  FunctionExpression,
  Node,
  TypeChecker,
} from 'ts-morph';

// Runtime values, shared evaluation state, and evidence stay independent of dispatch
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

export type Environment = ReadonlyMap<string, RuntimeValue>;

export type RuntimeValue = StaticValue | RegExp | CallableValue;

export type CallableNode = ArrowFunction | FunctionDeclaration | FunctionExpression;

export interface CallableValue {
  readonly callable: true;
  readonly node: CallableNode;
  readonly environment: Environment;
}

export interface EvaluationState {
  operations: number;
  readonly active: Set<string>;
}

export interface EvaluationContext {
  readonly checker: TypeChecker;
  readonly constants: Readonly<Record<string, StaticValue>>;
  evaluate(
    node: Node,
    environment: Environment,
    depth: number,
    state: EvaluationState
  ): EvaluationResult<RuntimeValue>;
  chargeOperations(amount: number, state: EvaluationState, node: Node): EvaluationResult<true>;
}

export const isCallable = (value: RuntimeValue): value is CallableValue =>
  typeof value === 'object' && value !== null && 'callable' in value;

export const known = <T>(value: T, node: Node): EvaluationResult<T> => ({
  known: true,
  value,
  evidence: [evidenceFor(node)],
});

export const unknown = (reason: string, node: Node): EvaluationResult<never> => ({
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

export const cloneRuntime = (value: RuntimeValue): RuntimeValue => {
  if (isCallable(value) || value instanceof RegExp || value === null || typeof value !== 'object')
    return value;
  if (Array.isArray(value)) return value.map(cloneRuntime) as StaticValue[];
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, cloneRuntime(item as RuntimeValue)])
  ) as StaticValue;
};
