import type { Logger } from '@nixcord/domain';
import { Predicate, Schema } from 'effect';

const LoggerMethodSchema = Schema.declare<Logger['info']>((value): value is Logger['info'] =>
  Predicate.isFunction(value)
);

const LoggerMethodsSchema = Schema.Struct({
  info: LoggerMethodSchema,
  warn: LoggerMethodSchema,
  error: LoggerMethodSchema,
  success: LoggerMethodSchema,
  debug: LoggerMethodSchema,
});

const LoggerSchema = Schema.declare<Logger>(
  (value): value is Logger => Schema.is(LoggerMethodsSchema)(value),
  {
    expected: 'Logger must expose info, warn, error, success, and debug methods',
  }
);

export const GeneratePluginOptionsParamsSchema = Schema.Struct({
  vencordPath: Schema.NonEmptyString,
  equicordPath: Schema.optional(Schema.NonEmptyString),
  vencordPluginsDir: Schema.NonEmptyString,
  equicordPluginsDir: Schema.NonEmptyString,
  outputPath: Schema.NonEmptyString,
  metadataPath: Schema.optional(Schema.NonEmptyString),
  overridesPath: Schema.optional(Schema.NonEmptyString),
  verbose: Schema.optional(Schema.Boolean),
  logger: LoggerSchema,
  skipGitMigrations: Schema.optional(Schema.Boolean),
});

export type GeneratePluginOptionsParams = typeof GeneratePluginOptionsParamsSchema.Type;

export interface GeneratePluginOptionsSummary {
  pluginsDir: string;
  sharedCount: number;
  vencordOnlyCount: number;
  equicordOnlyCount: number;
  diagnosticSummary?: GeneratePluginOptionsDiagnosticSummary;
}

export interface DiagnosticBucket {
  name: string;
  count: number;
}

export interface GeneratePluginOptionsDiagnosticSummary {
  total: number;
  byKind: DiagnosticBucket[];
  topPlugins: DiagnosticBucket[];
  topFiles: DiagnosticBucket[];
}
