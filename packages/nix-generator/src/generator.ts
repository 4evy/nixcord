import type { PluginConfig, PluginSetting, ReadonlyDeep, SettingType } from '@nixcord/shared';
import {
  INTEGER_STRING_PATTERN,
  isArray,
  isBoolean,
  isNestedConfig,
  isNull,
  isNumber,
  isObject,
  isString,
  NIX_ENUM_TYPE,
  NIX_TYPE_ATTRS,
  NIX_TYPE_BOOL,
  NIX_TYPE_FLOAT,
  NIX_TYPE_INT,
  NIX_TYPE_LIST_OF_ANYTHING,
  NIX_TYPE_LIST_OF_ATTRS,
  NIX_TYPE_LIST_OF_BOOL,
  NIX_TYPE_LIST_OF_NUMBER,
  NIX_TYPE_LIST_OF_STR,
  NIX_TYPE_NULL_OR_STR,
  NIX_TYPE_STR,
} from '@nixcord/shared';
import { toNixIdentifier } from './identifier.js';

export type PluginCategory = 'shared' | 'vencord' | 'equicord';

/** JSON representation of a single plugin setting for the Nix-side builder. */
export interface PluginSettingJson {
  type: string;
  default?: unknown;
  description?: string;
  enumValues?: (string | number | boolean)[];
  example?: string;
}

/** JSON representation of a plugin for the Nix-side builder. */
export interface PluginJson {
  description: string;
  settings: Record<string, PluginSettingJson | PluginJson>;
}

const categoryLabel = (category: PluginCategory): string => {
  switch (category) {
    case 'shared':
      return ' (Shared between Vencord and Equicord)';
    case 'vencord':
      return ' (Vencord-only)';
    case 'equicord':
      return ' (Equicord-only)';
  }
};

const buildEnumMappingDescription = (
  enumValues: readonly (string | number | boolean)[],
  enumLabels?: ReadonlyDeep<Record<string, string> & Partial<Record<number, string>>>
): string | undefined => {
  if (!enumLabels) return undefined;

  const integerValues = enumValues.filter(isNumber);
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

const lowerSettingType = (type: SettingType): string => {
  switch (type.kind) {
    case 'boolean':
      return NIX_TYPE_BOOL;
    case 'string':
      return type.nullable ? NIX_TYPE_NULL_OR_STR : NIX_TYPE_STR;
    case 'integer':
      return NIX_TYPE_INT;
    case 'float':
      return NIX_TYPE_FLOAT;
    case 'attrs':
      return type.nullable ? `types.nullOr ${NIX_TYPE_ATTRS}` : NIX_TYPE_ATTRS;
    case 'list':
      switch (type.element) {
        case 'string':
          return NIX_TYPE_LIST_OF_STR;
        case 'number':
          return NIX_TYPE_LIST_OF_NUMBER;
        case 'boolean':
          return NIX_TYPE_LIST_OF_BOOL;
        case 'attrs':
          return NIX_TYPE_LIST_OF_ATTRS;
        case 'anything':
          return NIX_TYPE_LIST_OF_ANYTHING;
      }
    case 'enum':
      return NIX_ENUM_TYPE;
  }
};

const resolveDefault = (setting: Readonly<PluginSetting>, nixType: string): unknown | undefined => {
  if (setting.default === undefined) return undefined;
  if (setting.default === null) return null;

  const val = setting.default;

  // Float integers need to stay as floats (e.g. 1 -> 1.0)
  if (isNumber(val) && nixType === NIX_TYPE_FLOAT && Number.isInteger(val))
    return { __nixRaw: val.toFixed(1) };

  // String integers used as int defaults (e.g. BigInt IDs)
  if (nixType === NIX_TYPE_INT && isString(val) && INTEGER_STRING_PATTERN.test(val))
    return { __nixRaw: val };

  if (
    isString(val) ||
    isNumber(val) ||
    isBoolean(val) ||
    isNull(val) ||
    isArray(val) ||
    isObject(val)
  )
    return val;

  return undefined;
};

const buildSettingDescription = (setting: Readonly<PluginSetting>): string | undefined => {
  const description = setting.description
    ? `${setting.description}${setting.restartNeeded ? ' (restart required)' : ''}`
    : undefined;
  if (!description) return undefined;

  if (setting.type.kind !== 'enum' || !setting.type.values.every(isNumber)) return description;

  const mapping = buildEnumMappingDescription(setting.type.values, setting.type.labels);
  return mapping !== undefined ? `${description}\n\nValues: ${mapping}` : description;
};

export const generateSettingJson = (
  setting: Readonly<PluginSetting>,
  _category?: PluginCategory
): PluginSettingJson => {
  const nixType = lowerSettingType(setting.type);
  const json: PluginSettingJson = { type: nixType };

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
    if (isNestedConfig(setting)) {
      settings[nixName] = generatePluginJson(setting.name, setting as PluginConfig, category);
    } else {
      settings[nixName] = generateSettingJson(setting as PluginSetting, category);
    }
  }

  const description = `${config.description ?? ''}${category ? categoryLabel(category) : ''}`;

  return { description, settings };
};

export const generatePluginModule = (
  plugins: ReadonlyDeep<Record<string, PluginConfig>>,
  category?: PluginCategory
): string => {
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

  return `${JSON.stringify(output, null, 2)}\n`;
};
