import type { PluginConfig, PluginSetting, SettingType } from '@nixcord/domain';
import {
  INTEGER_STRING_PATTERN,
  NIX_ENUM_TYPE,
  NIX_LIST_TYPES,
  NIX_TYPE_ATTRS,
  NIX_TYPE_BOOL,
  NIX_TYPE_FLOAT,
  NIX_TYPE_INT,
  NIX_TYPE_NULL_OR_ATTRS,
  NIX_TYPE_NULL_OR_STR,
  NIX_TYPE_STR,
  type NixSettingType,
} from '@nixcord/domain';
import { Match } from 'effect';
import { toNixIdentifier } from './identifier.js';

export type PluginCategory = 'shared' | 'vencord' | 'equicord';

/** JSON representation of a single plugin setting for the option compiler */
export interface PluginSettingJson {
  upstreamName: string;
  upstreamType: SettingType;
  type: NixSettingType;
  default?: unknown;
  description?: string;
  enumValues?: (string | number | boolean)[];
  example?: string;
  hidden?: boolean;
  restartNeeded?: boolean;
}

/** JSON representation of a plugin for the option compiler */
export interface PluginJson {
  upstreamName: string;
  category?: PluginCategory;
  directoryName?: string;
  source?: PluginConfig['source'];
  description: string;
  settings: Record<string, PluginSettingJson | PluginJson>;
}

const CATEGORY_LABELS = {
  shared: ' (Shared between Vencord and Equicord)',
  vencord: ' (Vencord-only)',
  equicord: ' (Equicord-only)',
} as const satisfies Record<PluginCategory, string>;

const buildEnumMappingDescription = (
  enumValues: readonly (string | number | boolean)[],
  enumLabels?: Readonly<Record<string, string> & Partial<Record<number, string>>>
): string | undefined => {
  if (!enumLabels) return undefined;

  const integerValues = enumValues.filter((value) => typeof value === 'number');
  if (integerValues.length === 0) return undefined;

  const mappings = integerValues
    .map((intValue) => ({
      value: intValue,
      label: enumLabels[intValue] ?? enumLabels[String(intValue)],
    }))
    .filter((item): item is { value: number; label: string } => typeof item.label === 'string')
    .map((item) => `${item.value} = ${item.label}`);

  return mappings.length === 0 ? undefined : mappings.join(', ');
};

type SettingTypeRules = {
  [Kind in SettingType['kind']]: (type: Extract<SettingType, { kind: Kind }>) => NixSettingType;
};

const SETTING_TYPES = {
  boolean: () => NIX_TYPE_BOOL,
  string: (type) => (type.nullable ? NIX_TYPE_NULL_OR_STR : NIX_TYPE_STR),
  integer: () => NIX_TYPE_INT,
  float: () => NIX_TYPE_FLOAT,
  attrs: (type) => (type.nullable ? NIX_TYPE_NULL_OR_ATTRS : NIX_TYPE_ATTRS),
  list: (type) => NIX_LIST_TYPES[type.element],
  enum: () => NIX_ENUM_TYPE,
} satisfies SettingTypeRules;

const lowerSettingType = (type: SettingType): NixSettingType => {
  return Match.value(type).pipe(Match.discriminatorsExhaustive('kind')(SETTING_TYPES));
};

const resolveDefault = (
  setting: Readonly<PluginSetting>,
  nixType: NixSettingType
): unknown | undefined => {
  if (setting.default === undefined) return undefined;
  if (setting.default === null) return null;

  const val = setting.default;

  // Float integers need to stay as floats (e.g. 1 -> 1.0)
  if (typeof val === 'number' && nixType === NIX_TYPE_FLOAT && Number.isInteger(val))
    return { __nixRaw: val.toFixed(1) };

  // String integers used as int defaults (e.g. BigInt IDs)
  if (nixType === NIX_TYPE_INT && typeof val === 'string' && INTEGER_STRING_PATTERN.test(val))
    return { __nixRaw: val };

  return val;
};

const buildSettingDescription = (setting: Readonly<PluginSetting>): string | undefined => {
  const description = setting.description
    ? `${setting.description}${setting.restartNeeded ? ' (restart required)' : ''}`
    : undefined;
  if (!description) return undefined;

  if (
    setting.type.kind !== 'enum' ||
    !setting.type.values.every((value) => typeof value === 'number')
  )
    return description;

  const mapping = buildEnumMappingDescription(setting.type.values, setting.type.labels);
  return mapping !== undefined ? `${description}\n\nValues: ${mapping}` : description;
};

export const generateSettingJson = (
  setting: Readonly<PluginSetting>,
  _category?: PluginCategory
): PluginSettingJson => {
  const nixType = lowerSettingType(setting.type);
  const json: PluginSettingJson = {
    upstreamName: setting.name,
    upstreamType: setting.type,
    type: nixType,
  };
  if (setting.hidden !== undefined) json.hidden = setting.hidden;
  if (setting.restartNeeded !== undefined) json.restartNeeded = setting.restartNeeded;

  if (setting.type.kind === 'enum') {
    json.enumValues = [...setting.type.values];
  }

  const resolvedDefault = resolveDefault(setting, nixType);
  if (resolvedDefault !== undefined) json.default = resolvedDefault;

  const description = buildSettingDescription(setting);
  if (description) json.description = description;

  if (setting.placeholder && !setting.description?.includes(setting.placeholder)) {
    json.example = setting.placeholder;
  }

  return json;
};

export const generatePluginJson = (
  pluginName: string,
  config: Readonly<PluginConfig>,
  category?: PluginCategory
): PluginJson => {
  const settings: Record<string, PluginSettingJson | PluginJson> = {};
  const sourceNames = new Map<string, string>();

  for (const [, setting] of Object.entries(config.settings)) {
    const nixName = toNixIdentifier(setting.name);
    if (setting.name === 'enable') continue; // enable is always auto-generated by Nix side
    const previous = sourceNames.get(nixName);
    if (previous && previous !== setting.name)
      throw new Error(
        `Settings ${JSON.stringify(previous)} and ${JSON.stringify(setting.name)} in plugin ${JSON.stringify(pluginName)} both normalize to ${JSON.stringify(nixName)}`
      );
    sourceNames.set(nixName, setting.name);
    if ('settings' in setting) {
      settings[nixName] = generatePluginJson(setting.name, setting, category);
    } else {
      settings[nixName] = generateSettingJson(setting, category);
    }
  }

  const description = `${config.description ?? ''}${category ? CATEGORY_LABELS[category] : ''}`;

  return {
    upstreamName: config.name,
    ...(category ? { category } : {}),
    ...(config.directoryName ? { directoryName: config.directoryName } : {}),
    ...(config.source ? { source: config.source } : {}),
    description,
    settings,
  };
};

export const generatePluginSchema = (
  plugins: Readonly<Record<string, PluginConfig>>,
  category?: PluginCategory
): Record<string, PluginJson> => {
  const output: Record<string, PluginJson> = {};
  const sourceNames = new Map<string, string>();

  const sortedKeys = Object.keys(plugins).sort((a, b) =>
    toNixIdentifier(a).localeCompare(toNixIdentifier(b))
  );

  for (const pluginName of sortedKeys) {
    const config = plugins[pluginName];
    if (!config) continue;
    const nixName = toNixIdentifier(pluginName);
    const previous = sourceNames.get(nixName);
    if (previous && previous !== pluginName)
      throw new Error(
        `Plugins ${JSON.stringify(previous)} and ${JSON.stringify(pluginName)} both normalize to ${JSON.stringify(nixName)}`
      );
    sourceNames.set(nixName, pluginName);
    output[nixName] = generatePluginJson(pluginName, config, category);
  }

  return output;
};
