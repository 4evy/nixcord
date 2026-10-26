import * as v from 'valibot';

export type SettingScalar = v.InferOutput<typeof SettingScalarSchema>;

export interface SettingObject {
  readonly [key: string]: SettingValue;
}

export type SettingValue = null | SettingScalar | readonly SettingValue[] | SettingObject;

export type SettingListElement = v.InferOutput<typeof SettingListElementSchema>;
export type SettingType = v.InferOutput<typeof SettingTypeSchema>;
export type PluginSetting = v.InferOutput<typeof PluginSettingSchema>;

export interface PluginConfig {
  readonly name: string;
  readonly description?: string;
  readonly isModified?: boolean;
  readonly settings: Readonly<Record<string, PluginSetting | PluginConfig>>;
  readonly directoryName?: string;
  readonly source?: { readonly file: string; readonly line: number };
}

const SettingScalarSchema = v.union([v.string(), v.pipe(v.number(), v.finite()), v.boolean()]);

const SettingValueSchema: v.GenericSchema<unknown, SettingValue> = v.lazy(() =>
  v.union([
    v.null(),
    SettingScalarSchema,
    v.array(SettingValueSchema),
    v.record(v.string(), SettingValueSchema),
  ])
);

const SettingListElementSchema = v.picklist(['string', 'number', 'boolean', 'attrs', 'anything']);

const SettingTypeSchema = v.pipe(
  v.variant('kind', [
    v.object({ kind: v.literal('boolean') }),
    v.object({ kind: v.literal('string'), nullable: v.boolean() }),
    v.object({ kind: v.literal('integer') }),
    v.object({ kind: v.literal('float') }),
    v.object({ kind: v.literal('attrs'), nullable: v.boolean() }),
    v.object({ kind: v.literal('list'), element: SettingListElementSchema }),
    v.object({
      kind: v.literal('enum'),
      values: v.pipe(
        v.array(SettingScalarSchema),
        v.transform((value) => Object.freeze(value))
      ),
      labels: v.optional(
        v.pipe(
          v.record(v.string(), v.string()),
          v.transform((value) => Object.freeze(value))
        )
      ),
    }),
  ]),
  v.transform((value) => Object.freeze(value))
);

const PluginSettingSchema = v.pipe(
  v.object({
    name: v.string(),
    type: SettingTypeSchema,
    description: v.optional(v.string()),
    default: v.optional(SettingValueSchema),
    placeholder: v.optional(v.string()),
    hidden: v.optional(v.boolean()),
    restartNeeded: v.optional(v.boolean()),
  }),
  v.transform((value) => Object.freeze(value))
);

const PluginConfigSchema: v.GenericSchema<unknown, PluginConfig> = v.lazy(() =>
  v.object({
    name: v.string(),
    description: v.optional(v.string()),
    isModified: v.optional(v.boolean()),
    settings: v.record(v.string(), v.union([PluginSettingSchema, PluginConfigSchema])),
    directoryName: v.optional(v.string()),
    source: v.optional(
      v.object({ file: v.string(), line: v.pipe(v.number(), v.safeInteger(), v.gtValue(0)) })
    ),
  })
);

const SettingRenameSchema = v.pipe(
  v.object({ pluginName: v.string(), oldSetting: v.string(), newSetting: v.string() }),
  v.transform((value) => Object.freeze(value))
);

const PluginRenameSchema = v.pipe(
  v.object({ oldName: v.string(), newName: v.string() }),
  v.transform((value) => Object.freeze(value))
);

const ParseDiagnosticSchema = v.pipe(
  v.object({
    code: v.string(),
    severity: v.picklist(['info', 'warning', 'error']),
    stage: v.picklist(['discovery', 'evaluation', 'execution', 'normalization']),
    pluginName: v.optional(v.string()),
    settingPath: v.optional(v.string()),
    location: v.optional(
      v.pipe(
        v.object({
          file: v.string(),
          line: v.pipe(v.number(), v.safeInteger(), v.gtValue(0)),
          column: v.pipe(v.number(), v.safeInteger(), v.gtValue(0)),
        }),
        v.transform((value) => Object.freeze(value))
      )
    ),
    message: v.string(),
    evidence: v.optional(
      v.pipe(
        v.array(v.string()),
        v.transform((value) => Object.freeze(value))
      )
    ),
  }),
  v.transform((value) => Object.freeze(value))
);

export const ParsedPluginsResultSchema = v.pipe(
  v.object({
    vencordPlugins: v.pipe(
      v.record(v.string(), PluginConfigSchema),
      v.transform((value) => Object.freeze(value))
    ),
    equicordPlugins: v.pipe(
      v.record(v.string(), PluginConfigSchema),
      v.transform((value) => Object.freeze(value))
    ),
    settingRenames: v.pipe(
      v.array(SettingRenameSchema),
      v.transform((value) => Object.freeze(value))
    ),
    pluginRenames: v.pipe(
      v.array(PluginRenameSchema),
      v.transform((value) => Object.freeze(value))
    ),
    diagnostics: v.pipe(
      v.array(ParseDiagnosticSchema),
      v.transform((value) => Object.freeze(value))
    ),
  }),
  v.transform((value) => Object.freeze(value))
);

export type ParsedPluginsResult = v.InferOutput<typeof ParsedPluginsResultSchema>;
export type SettingRename = v.InferOutput<typeof SettingRenameSchema>;
export type PluginRename = v.InferOutput<typeof PluginRenameSchema>;
export type ParseDiagnostic = v.InferOutput<typeof ParseDiagnosticSchema>;

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
