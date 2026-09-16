import * as z from 'zod';

export type SettingScalar = z.infer<typeof SettingScalarSchema>;

export interface SettingObject {
  readonly [key: string]: SettingValue;
}

export type SettingValue = null | SettingScalar | readonly SettingValue[] | SettingObject;

export type SettingListElement = z.infer<typeof SettingListElementSchema>;
export type SettingType = z.infer<typeof SettingTypeSchema>;
export type PluginSetting = z.infer<typeof PluginSettingSchema>;

export interface PluginConfig {
  readonly name: string;
  readonly description?: string;
  readonly isModified?: boolean;
  readonly settings: Readonly<Record<string, PluginSetting | PluginConfig>>;
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

const SettingListElementSchema = z.enum(['string', 'number', 'boolean', 'attrs', 'anything']);

const SettingTypeSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('boolean') }),
    z.object({ kind: z.literal('string'), nullable: z.boolean() }),
    z.object({ kind: z.literal('integer') }),
    z.object({ kind: z.literal('float') }),
    z.object({ kind: z.literal('attrs'), nullable: z.boolean() }),
    z.object({
      kind: z.literal('list'),
      element: SettingListElementSchema,
    }),
    z.object({
      kind: z.literal('enum'),
      values: z.array(SettingScalarSchema).readonly(),
      labels: z.record(z.string(), z.string()).readonly().optional(),
    }),
  ])
  .readonly();

const PluginSettingSchema = z
  .object({
    name: z.string(),
    type: SettingTypeSchema,
    description: z.string().optional(),
    default: SettingValueSchema.optional(),
    placeholder: z.string().optional(),
    hidden: z.boolean().optional(),
    restartNeeded: z.boolean().optional(),
  })
  .readonly();

const PluginConfigSchema: z.ZodType<PluginConfig> = z.lazy(() =>
  z.object({
    name: z.string(),
    description: z.string().optional(),
    isModified: z.boolean().optional(),
    settings: z.record(z.string(), z.union([PluginSettingSchema, PluginConfigSchema])),
    directoryName: z.string().optional(),
  })
);

const SettingRenameSchema = z
  .object({
    pluginName: z.string(),
    oldSetting: z.string(),
    newSetting: z.string(),
  })
  .readonly();

const PluginRenameSchema = z
  .object({
    oldName: z.string(),
    newName: z.string(),
  })
  .readonly();

const ParseDiagnosticSchema = z
  .object({
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
      .readonly()
      .optional(),
    message: z.string(),
    evidence: z.array(z.string()).readonly().optional(),
  })
  .readonly();

export const ParsedPluginsResultSchema = z
  .object({
    vencordPlugins: z.record(z.string(), PluginConfigSchema).readonly(),
    equicordPlugins: z.record(z.string(), PluginConfigSchema).readonly(),
    settingRenames: z.array(SettingRenameSchema).readonly(),
    pluginRenames: z.array(PluginRenameSchema).readonly(),
    diagnostics: z.array(ParseDiagnosticSchema).readonly(),
  })
  .readonly();

export type ParsedPluginsResult = z.infer<typeof ParsedPluginsResultSchema>;
export type SettingRename = z.infer<typeof SettingRenameSchema>;
export type PluginRename = z.infer<typeof PluginRenameSchema>;
export type ParseDiagnostic = z.infer<typeof ParseDiagnosticSchema>;

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
  settingRemovals?: Record<string, Record<string, DeprecatedRemovalEntry>>;
};
