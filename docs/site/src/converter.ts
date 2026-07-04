import equicordPlugins from '../../../modules/plugins/equicord.json';
import parseRules from '../../../modules/plugins/parse-rules.json';
import sharedPlugins from '../../../modules/plugins/shared.json';
import vencordPlugins from '../../../modules/plugins/vencord.json';

type JsonObject = Record<string, unknown>;

type PluginSchema = {
  settings: Record<string, SettingSchema>;
};

type SettingSchema =
  | {
      default?: unknown;
      settings: Record<string, SettingSchema>;
    }
  | {
      default?: unknown;
      type: string;
    };

type PluginMetadata = Record<string, PluginSchema>;

export type ConverterStats = {
  configPluginCount: number;
  extraPluginCount: number;
  knownSettingCount: number;
  pluginCount: number;
  preservedSettingCount: number;
};

export type ConverterResult = {
  output: string;
  stats: ConverterStats;
};

type NormalizedPlugin = {
  inputName: string;
  nixName: string | null;
  schema: PluginSchema | null;
  value: JsonObject;
};

const pluginMetadata: PluginMetadata = {
  ...(sharedPlugins as PluginMetadata),
  ...(vencordPlugins as PluginMetadata),
  ...(equicordPlugins as PluginMetadata),
};

const internalPluginNames = new Set(
  [
    'AudioPlayerAPI',
    'BadgeAPI',
    'ChatInputButtonAPI',
    'CommandsAPI',
    'ConcatenatedComponentExtractor',
    'ConcatenatedModules',
    'ContextMenuAPI',
    'DynamicImageModalAPI',
    'ExtraContextMenusAPI',
    'HeaderBarAPI',
    'MemberListDecoratorsAPI',
    'MessageAccessoriesAPI',
    'MessageDecorationsAPI',
    'MessageEventsAPI',
    'MessagePopoverAPI',
    'MessageUpdaterAPI',
    'NicknameIconsAPI',
    'NoticesAPI',
    'NoTrack',
    'ProfileCollectionsAPI',
    'ProfileSectionsAPI',
    'ServerListAPI',
    'Settings',
    'SupportHelper',
    'UserAreaAPI',
    'UserSettingsAPI',
  ].map((name) => name.toLowerCase())
);

const PARENTHESES_PATTERN = /\s*\([^)]*\)\s*/g;
const INVALID_CHARS_PATTERN = /[^A-Za-z0-9_'-]/g;
const LEADING_TRAILING_UNDERSCORES_PATTERN = /^_+|_+$/g;
const MULTIPLE_UNDERSCORES_PATTERN = /_+/g;
const VALID_IDENTIFIER_START_PATTERN = /^[A-Za-z_]/;
const LEADING_UNDERSCORE_PREFIX = '_';
const WORD_PATTERN = /[0-9]+[a-z]+|[A-Z]+(?=[A-Z][a-z]|[0-9]|$)|[A-Z]?[a-z]+|[0-9]+/g;
const PLUS_PATTERN = /\+/g;

const pluginNameLookup = buildPluginNameLookup();

export function convertSettingsJsonToNix(input: string): ConverterResult {
  const parsed = parseSettingsJson(input);
  const plugins = extractPlugins(parsed);
  const configPlugins: JsonObject = {};
  const extraPlugins: JsonObject = {};
  let knownSettingCount = 0;
  let preservedSettingCount = 0;

  for (const plugin of normalizePlugins(plugins)) {
    const configPlugin: JsonObject = {};
    const extraPlugin: JsonObject = {};
    const enabled = readEnabled(plugin.value);

    if (plugin.schema == null && isInternalPluginName(plugin.inputName)) continue;

    if (enabled === true) {
      if (plugin.schema != null) configPlugin.enable = true;
      else extraPlugin.enable = true;
    }

    if (plugin.schema == null || plugin.nixName == null) {
      copyPluginSettingsToExtra(plugin.value, extraPlugin);
      if (Object.keys(extraPlugin).some((key) => key !== 'enable')) {
        extraPlugins[plugin.inputName] = extraPlugin;
        preservedSettingCount += Object.keys(extraPlugin).filter((key) => key !== 'enable').length;
      }
      continue;
    }

    for (const [inputSettingName, settingValue] of Object.entries(plugin.value)) {
      if (inputSettingName === 'enabled' || inputSettingName === 'enable') continue;

      const mapped = mapSettingName(plugin.nixName, inputSettingName, plugin.schema.settings);
      if (mapped == null) {
        extraPlugin[inputSettingName] = settingValue;
        preservedSettingCount += 1;
        continue;
      }

      const target = mapped.schema;
      if (shouldOmitKnownSettingValue(target, settingValue)) continue;

      const normalizedValue =
        isObject(settingValue) && isNestedSetting(target)
          ? convertNestedSettings(plugin.nixName, settingValue, target.settings)
          : settingValue;

      configPlugin[mapped.nixName] = normalizedValue;
      knownSettingCount += 1;
    }

    if (Object.keys(configPlugin).length > 0) {
      configPlugins[plugin.nixName] = configPlugin;
    }

    if (Object.keys(extraPlugin).length > 0) {
      extraPlugins[plugin.nixName] = extraPlugin;
    }
  }

  const nixcordAttrs: JsonObject = {};
  if (Object.keys(configPlugins).length > 0) {
    nixcordAttrs.config = { plugins: configPlugins };
  }
  if (Object.keys(extraPlugins).length > 0) {
    nixcordAttrs.extraConfig = { plugins: extraPlugins };
  }

  if (isObject(parsed) && typeof parsed.quickCss === 'string' && parsed.quickCss.length > 0) {
    nixcordAttrs.quickCss = parsed.quickCss;
    nixcordAttrs.config = {
      ...(isObject(nixcordAttrs.config) ? nixcordAttrs.config : {}),
      useQuickCss: true,
    };
  }

  if (Object.keys(nixcordAttrs).length === 0) {
    throw new Error('No non-default plugin settings were found in this JSON.');
  }

  return {
    output: printNixcordAttrs(nixcordAttrs),
    stats: {
      configPluginCount: Object.keys(configPlugins).length,
      extraPluginCount: Object.keys(extraPlugins).length,
      knownSettingCount,
      pluginCount: Object.keys(plugins).length,
      preservedSettingCount,
    },
  };
}

function parseSettingsJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON: ${message}`);
  }
}

function extractPlugins(parsed: unknown): JsonObject {
  if (!isObject(parsed)) throw new Error('Expected a JSON object.');

  const settings = parsed.settings;
  if (isObject(settings) && isObject(settings.plugins)) return settings.plugins;
  if (isObject(parsed.plugins)) return parsed.plugins;

  const looksLikePluginMap = Object.values(parsed).some(
    (value) => isObject(value) && ('enabled' in value || 'enable' in value)
  );
  if (looksLikePluginMap) return parsed;

  throw new Error('Expected Vencord/Equicord settings with a plugins object.');
}

function normalizePlugins(plugins: JsonObject): NormalizedPlugin[] {
  return Object.entries(plugins)
    .filter((entry): entry is [string, JsonObject] => isObject(entry[1]))
    .map(([inputName, value]) => {
      const nixName = pluginNameLookup.get(inputName.toLowerCase()) ?? null;
      const schema = nixName == null ? null : (pluginMetadata[nixName] ?? null);

      return { inputName, nixName, schema, value };
    })
    .sort((left, right) =>
      (left.nixName ?? toNixIdentifier(left.inputName)).localeCompare(
        right.nixName ?? toNixIdentifier(right.inputName)
      )
    );
}

function buildPluginNameLookup(): Map<string, string> {
  const lookup = new Map<string, string>();
  const pluginRenames = parseRules.pluginRenames as Record<string, string>;

  for (const nixName of Object.keys(pluginMetadata)) {
    lookup.set(nixName.toLowerCase(), nixName);
    lookup.set(toNixIdentifier(nixName).toLowerCase(), nixName);

    const upstreamName = pluginRenames[nixName];
    if (upstreamName) lookup.set(upstreamName.toLowerCase(), nixName);
  }

  return lookup;
}

function readEnabled(value: JsonObject): boolean | undefined {
  if (typeof value.enabled === 'boolean') return value.enabled;
  if (typeof value.enable === 'boolean') return value.enable;
  return undefined;
}

function isInternalPluginName(name: string): boolean {
  return internalPluginNames.has(name.toLowerCase());
}

function copyPluginSettingsToExtra(source: JsonObject, target: JsonObject): void {
  for (const [key, value] of Object.entries(source)) {
    if (key === 'enabled' || key === 'enable') continue;
    target[key] = value;
  }
}

function convertNestedSettings(
  pluginName: string,
  values: JsonObject,
  schema: Record<string, SettingSchema>
): JsonObject {
  const converted: JsonObject = {};

  for (const [name, value] of Object.entries(values)) {
    const mapped = mapSettingName(pluginName, name, schema);
    if (mapped == null) {
      converted[name] = value;
      continue;
    }

    if (shouldOmitKnownSettingValue(mapped.schema, value)) continue;

    converted[mapped.nixName] =
      isObject(value) && isNestedSetting(mapped.schema)
        ? convertNestedSettings(pluginName, value, mapped.schema.settings)
        : value;
  }

  return converted;
}

function mapSettingName(
  pluginName: string,
  inputName: string,
  schema: Record<string, SettingSchema>
): { nixName: string; schema: SettingSchema } | null {
  if (schema[inputName]) return { nixName: inputName, schema: schema[inputName] };

  const settingRenames = (parseRules.settingRenames as Record<string, Record<string, string>>)[
    pluginName
  ];
  const renamed = settingRenames
    ? Object.entries(settingRenames).find(([, upstreamName]) => stripQuotes(upstreamName) === inputName)
    : undefined;

  if (renamed && schema[renamed[0]]) return { nixName: renamed[0], schema: schema[renamed[0]] };

  const normalized = toNixIdentifier(inputName);
  if (schema[normalized]) return { nixName: normalized, schema: schema[normalized] };

  return null;
}

function stripQuotes(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1);
  return value;
}

function isNestedSetting(setting: SettingSchema): setting is { settings: Record<string, SettingSchema> } {
  return 'settings' in setting && isObject(setting.settings);
}

function shouldOmitKnownSettingValue(schema: SettingSchema, value: unknown): boolean {
  if (!('default' in schema)) return false;
  return isJsonEqual(value, normalizeDefaultValue(schema.default));
}

function normalizeDefaultValue(value: unknown): unknown {
  if (isObject(value) && Object.keys(value).length === 1 && typeof value.__nixRaw === 'string') {
    try {
      return JSON.parse(value.__nixRaw);
    } catch {
      return value.__nixRaw;
    }
  }

  return value;
}

function isJsonEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    if (left.length !== right.length) return false;
    return left.every((item, index) => isJsonEqual(item, right[index]));
  }

  if (isObject(left) || isObject(right)) {
    if (!isObject(left) || !isObject(right)) return false;

    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (!isJsonEqual(leftKeys, rightKeys)) return false;

    return leftKeys.every((key) => isJsonEqual(left[key], right[key]));
  }

  return false;
}

function isObject(value: unknown): value is JsonObject {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function printNixcordAttrs(value: JsonObject): string {
  const assignments = flattenNixcordAssignments(value);
  const lines = assignments.map(([path, assignmentValue]) => {
    return `  ${path.map(quoteAttrName).join('.')} = ${printNixValue(assignmentValue, 1)};`;
  });

  return `{\n${lines.join('\n')}\n}\n`;
}

function flattenNixcordAssignments(value: JsonObject): [string[], unknown][] {
  const assignments: [string[], unknown][] = [];
  const prefix = ['programs', 'nixcord'];

  for (const [key, entryValue] of Object.entries(value)) {
    if ((key === 'config' || key === 'extraConfig') && isObject(entryValue)) {
      for (const [nestedKey, nestedValue] of Object.entries(entryValue)) {
        assignments.push([[...prefix, key, nestedKey], nestedValue]);
      }
      continue;
    }

    assignments.push([[...prefix, key], entryValue]);
  }

  return assignments;
}

function printNixValue(value: unknown, level: number): string {
  if (value == null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'string') return quoteNixString(value);
  if (Array.isArray(value)) return printNixList(value, level);
  if (isObject(value)) return printNixObject(value, level);
  return quoteNixString(String(value));
}

function printNixObject(value: JsonObject, level: number): string {
  const entries = Object.entries(value).filter(([, entryValue]) => entryValue !== undefined);
  if (entries.length === 0) return '{ }';

  const indent = '  '.repeat(level);
  const childIndent = '  '.repeat(level + 1);
  const lines = entries.map(([key, entryValue]) => {
    if (isEnableOnlyObject(entryValue)) {
      return `${childIndent}${quoteAttrName(key)}.enable = ${printNixValue(entryValue.enable, level + 1)};`;
    }

    return `${childIndent}${quoteAttrName(key)} = ${printNixValue(entryValue, level + 1)};`;
  });

  return `{\n${lines.join('\n')}\n${indent}}`;
}

function printNixList(value: unknown[], level: number): string {
  if (value.length === 0) return '[ ]';
  if (value.every((item) => !isObject(item) && !Array.isArray(item))) {
    return `[ ${value.map((item) => printNixValue(item, level)).join(' ')} ]`;
  }

  const indent = '  '.repeat(level);
  const childIndent = '  '.repeat(level + 1);
  return `[\n${value.map((item) => `${childIndent}${printNixValue(item, level + 1)}`).join('\n')}\n${indent}]`;
}

function quoteAttrName(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_'-]*$/.test(name) ? name : quoteNixString(name);
}

function isEnableOnlyObject(value: unknown): value is { enable: unknown } {
  return isObject(value) && Object.keys(value).length === 1 && 'enable' in value;
}

function quoteNixString(value: string): string {
  return `"${value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$\{/g, '\\${')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')}"`;
}

function capitalize(word: string): string {
  return word.length === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1);
}

function toNixIdentifier(name: string): string {
  const originalStartsWithUnderscore = name.startsWith('_');
  const originalEndsWithUnderscore = name.endsWith('_');
  const normalizedInput = name.replace(PLUS_PATTERN, ' Plus ');
  const sanitized = normalizedInput
    .replace(PARENTHESES_PATTERN, '')
    .replace(INVALID_CHARS_PATTERN, '_')
    .replace(LEADING_TRAILING_UNDERSCORES_PATTERN, '')
    .replace(MULTIPLE_UNDERSCORES_PATTERN, '_');
  const needsPrefix = sanitized.length === 0 || !VALID_IDENTIFIER_START_PATTERN.test(sanitized);

  const words: string[] = [];
  for (const segment of sanitized.split(/[_\s'-]+/)) {
    const normalizedSegment = segment.replace(/([A-Z]{2,})s(?=$|[A-Z])/g, '$1S');
    for (const match of normalizedSegment.matchAll(WORD_PATTERN)) {
      words.push(match[0].toLowerCase());
    }
  }

  let identifier =
    words.length === 0
      ? sanitized
      : words.map((word, index) => (index === 0 ? word : capitalize(word))).join('');

  if (
    originalStartsWithUnderscore &&
    !originalEndsWithUnderscore &&
    identifier &&
    VALID_IDENTIFIER_START_PATTERN.test(identifier)
  ) {
    return `_${identifier}`;
  }

  if (needsPrefix || identifier.length === 0 || !VALID_IDENTIFIER_START_PATTERN.test(identifier)) {
    identifier = `${LEADING_UNDERSCORE_PREFIX}${identifier}`;
  }

  return identifier;
}
