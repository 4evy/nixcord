import * as z from 'zod';
import type { ReadonlyDeep } from './type-utils.js';

export type SettingScalar = string | number | boolean;

export interface SettingObject {
  readonly [key: string]: SettingValue;
}

export type SettingValue = null | SettingScalar | readonly SettingValue[] | SettingObject;

export type SettingType =
  | { readonly kind: 'boolean' }
  | { readonly kind: 'string'; readonly nullable: boolean }
  | { readonly kind: 'integer' }
  | { readonly kind: 'float' }
  | { readonly kind: 'attrs'; readonly nullable: boolean }
  | { readonly kind: 'list'; readonly element: 'string' | 'attrs' }
  | {
      readonly kind: 'enum';
      readonly values: readonly SettingScalar[];
      readonly labels?: Readonly<Record<string, string>>;
    };

export interface PluginSetting {
  readonly name: string;
  readonly type: SettingType;
  readonly description?: string;
  readonly default?: SettingValue;
  readonly placeholder?: string;
  readonly hidden?: boolean;
  readonly restartNeeded?: boolean;
}

export interface PluginConfig {
  readonly name: string;
  readonly description?: string;
  readonly isModified?: boolean;
  readonly settings: ReadonlyDeep<Record<string, PluginSetting | PluginConfig>>;
  readonly directoryName?: string;
}

const SettingScalarSchema = z.union([z.string(), z.number(), z.boolean()]);

const SettingValueSchema: z.ZodType<SettingValue> = z.lazy(() =>
  z.union([
    z.null(),
    SettingScalarSchema,
    z.array(SettingValueSchema),
    z.record(z.string(), SettingValueSchema),
  ])
);

const SettingTypeSchema: z.ZodType<SettingType> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('boolean') }),
  z.object({ kind: z.literal('string'), nullable: z.boolean() }),
  z.object({ kind: z.literal('integer') }),
  z.object({ kind: z.literal('float') }),
  z.object({ kind: z.literal('attrs'), nullable: z.boolean() }),
  z.object({ kind: z.literal('list'), element: z.enum(['string', 'attrs']) }),
  z.object({
    kind: z.literal('enum'),
    values: z.array(SettingScalarSchema),
    labels: z.record(z.string(), z.string()).optional(),
  }),
]);

const PluginSettingSchema = z.object({
  name: z.string(),
  type: SettingTypeSchema,
  description: z.string().optional(),
  default: SettingValueSchema.optional(),
  placeholder: z.string().optional(),
  hidden: z.boolean().optional(),
  restartNeeded: z.boolean().optional(),
});

const PluginConfigSchema = z.lazy(() =>
  z.object({
    name: z.string(),
    description: z.string().optional(),
    isModified: z.boolean().optional(),
    settings: z.record(z.string(), z.union([PluginSettingSchema, PluginConfigSchema])),
    directoryName: z.string().optional(),
  })
) as z.ZodType<PluginConfig>;

const SettingRenameSchema = z.object({
  pluginName: z.string(),
  oldSetting: z.string(),
  newSetting: z.string(),
});

const PluginRenameSchema = z.object({
  oldName: z.string(),
  newName: z.string(),
});

const ParseDiagnosticSchema = z.object({
  code: z.string(),
  severity: z.enum(['info', 'warning', 'error']),
  stage: z.enum(['discovery', 'evaluation', 'execution', 'normalization']),
  pluginName: z.string().optional(),
  settingPath: z.string().optional(),
  location: z
    .object({
      file: z.string(),
      line: z.number().int().positive(),
      column: z.number().int().positive(),
    })
    .optional(),
  message: z.string(),
  evidence: z.array(z.string()).optional(),
});

export const ParsedPluginsResultSchema = z.object({
  vencordPlugins: z.record(z.string(), PluginConfigSchema),
  equicordPlugins: z.record(z.string(), PluginConfigSchema),
  settingRenames: z.array(SettingRenameSchema),
  pluginRenames: z.array(PluginRenameSchema),
  diagnostics: z.array(ParseDiagnosticSchema),
});

export interface ParsedPluginsResult {
  readonly vencordPlugins: ReadonlyDeep<Record<string, PluginConfig>>;
  readonly equicordPlugins: ReadonlyDeep<Record<string, PluginConfig>>;
  readonly settingRenames: readonly SettingRename[];
  readonly pluginRenames: readonly PluginRename[];
  readonly diagnostics: readonly ParseDiagnostic[];
}

export interface SettingRename {
  readonly pluginName: string;
  readonly oldSetting: string;
  readonly newSetting: string;
}

export interface PluginRename {
  readonly oldName: string;
  readonly newName: string;
}

export interface ParseDiagnostic {
  readonly code: string;
  readonly severity: 'info' | 'warning' | 'error';
  readonly stage: 'discovery' | 'evaluation' | 'execution' | 'normalization';
  readonly pluginName?: string;
  readonly settingPath?: string;
  readonly location?: {
    readonly file: string;
    readonly line: number;
    readonly column: number;
  };
  readonly message: string;
  readonly evidence?: readonly string[];
}

export type DeprecatedRenameEntry = {
  to: string;
  date?: string;
};

export type DeprecatedRemovalEntry = {
  date: string;
};

export type DeprecatedData = {
  renames: Record<string, DeprecatedRenameEntry>;
  removals: Record<string, DeprecatedRemovalEntry>;
  settingRenames: Record<string, Record<string, string>>;
};
