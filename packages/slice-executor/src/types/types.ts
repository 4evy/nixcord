import { Schema } from 'effect';

export interface SliceExecutionOptions {
  readonly settingKey: string;
  readonly allowedRoot: string;
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
  readonly maxTraceEvents?: number;
  readonly maxDeclarations?: number;
  readonly maxSourceBytes?: number;
}

const SliceTraceEventSchema = Schema.Struct({
  kind: Schema.Literals(['read', 'write', 'control']),
  path: Schema.optional(Schema.Array(Schema.String)),
  component: Schema.optional(Schema.String),
  value: Schema.optional(Schema.Unknown),
});

const SliceExecutionResultSchema = Schema.Union([
  Schema.Struct({
    ok: Schema.Literal(true),
    events: Schema.Array(SliceTraceEventSchema),
    hasDefault: Schema.Boolean,
    value: Schema.optional(Schema.Unknown),
    evidence: Schema.Array(Schema.String),
  }),
  Schema.Struct({
    ok: Schema.Literal(false),
    code: Schema.Literals(['execution-timeout', 'execution-failed', 'execution-limit']),
    message: Schema.String,
    evidence: Schema.Array(Schema.String),
  }),
]);

const RunnerPayloadSchema = Schema.Struct({
  code: Schema.String,
  settingKey: Schema.String,
  maxTraceEvents: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});

export type SliceTraceEvent = typeof SliceTraceEventSchema.Type;
export type SliceExecutionResult = typeof SliceExecutionResultSchema.Type;
export type RunnerPayload = typeof RunnerPayloadSchema.Type;

export const decodeSliceExecutionResult = Schema.decodeUnknownSync(
  Schema.fromJsonString(SliceExecutionResultSchema)
);
export const decodeRunnerPayload = Schema.decodeUnknownSync(RunnerPayloadSchema);
