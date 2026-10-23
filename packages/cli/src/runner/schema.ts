import type { NixSettingType } from '@nixcord/domain';
import type { PluginJson, PluginSettingJson } from '@nixcord/nix-generator';

type Settings = PluginJson['settings'];
type Schemas = Readonly<Record<string, PluginJson>>;

const nixString = (value: string): string => {
  if (value.includes('\0')) throw new TypeError('Nix strings cannot contain null bytes');
  return `"${value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')
    .replaceAll('\t', '\\t')
    .replaceAll('${', '\\${')}"`;
};

const nixValue = (value: unknown): string => {
  if (value === null) return 'null';
  if (typeof value === 'string') return nixString(value);
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Nix requires a decimal point in scientific notation
    const literal = String(value).replace(/^(-?\d+)([eE])/, '$1.0$2');
    return value < 0 ? `(${literal})` : literal;
  }
  if (Array.isArray(value)) return `[ ${value.map(nixValue).join(' ')} ]`;
  if (typeof value === 'object' && value !== null)
    return `{ ${Object.entries(value)
      .map(([name, item]) => `${nixString(name)} = ${nixValue(item)};`)
      .join(' ')} }`;
  throw new TypeError(`Cannot emit a Nix value of type ${typeof value}`);
};

const mergeSettings = (left: Settings, right: Settings): Settings =>
  Object.fromEntries(
    [...new Set([...Object.keys(left), ...Object.keys(right)])].sort().map((name) => {
      const previous = left[name];
      const next = right[name];
      // Replace leaf descriptors as a whole to avoid inheriting stale defaults
      const value =
        previous && next && 'settings' in previous && 'settings' in next
          ? { ...previous, ...next, settings: mergeSettings(previous.settings, next.settings) }
          : (next ?? previous);
      return [name, value];
    })
  );

const SETTING_TYPES = {
  'types.bool': 'lib.types.bool',
  'types.str': 'lib.types.str',
  'types.int': 'lib.types.int',
  'types.float': 'lib.types.float',
  'types.attrs': 'jsonAttrs',
  'types.nullOr types.str': 'lib.types.nullOr lib.types.str',
  'types.nullOr types.attrs': 'lib.types.nullOr jsonAttrs',
  'types.nullOr (types.listOf types.str)': 'lib.types.nullOr (lib.types.listOf lib.types.str)',
  'types.listOf types.str': 'lib.types.listOf lib.types.str',
  'types.listOf types.number': 'lib.types.listOf lib.types.number',
  'types.listOf types.bool': 'lib.types.listOf lib.types.bool',
  'types.listOf types.attrs': 'lib.types.listOf jsonAttrs',
  'types.listOf types.anything': 'lib.types.listOf lib.types.anything',
} satisfies Record<Exclude<NixSettingType, 'types.enum'>, string>;

const settingType = (setting: PluginSettingJson): string => {
  if (setting.type === 'types.enum') return `lib.types.enum ${nixValue(setting.enumValues ?? [])}`;
  const type = SETTING_TYPES[setting.type];
  if (typeof type !== 'string')
    throw new TypeError(`Unsupported plugin setting type: ${setting.type}`);
  return type;
};

const defaultValue = (setting: PluginSettingJson): string => {
  const value = setting.default;
  if (
    (setting.type === 'types.int' || setting.type === 'types.float') &&
    typeof value === 'object' &&
    value !== null &&
    Object.keys(value).length === 1 &&
    '__nixRaw' in value
  ) {
    const raw = value.__nixRaw;
    if (typeof raw !== 'string' || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(raw))
      throw new TypeError('Numeric defaults must contain a Nix number literal');
    // The lexer cannot represent the positive magnitude of the minimum integer
    if (raw === '-9223372036854775808') return `builtins.fromJSON ${nixString(raw)}`;
    return raw.replace(/^(-?\d+)([eE])/, '$1.0$2');
  }
  return nixValue(value);
};

const settingOptions = (settings: Settings): string =>
  Object.entries(settings)
    .map(([name, setting]) => {
      if ('settings' in setting) return `${nixString(name)} = ${pluginOptions(setting)};`;
      const fields = [
        `type = ${settingType(setting)};`,
        `description = ${nixString(setting.description ?? '')};`,
      ];
      if (Object.hasOwn(setting, 'default')) fields.push(`default = ${defaultValue(setting)};`);
      if (Object.hasOwn(setting, 'example')) fields.push(`example = ${nixValue(setting.example)};`);
      return `${nixString(name)} = lib.options.mkOption { ${fields.join(' ')} };`;
    })
    .join('\n');

const pluginOptions = (plugin: PluginJson): string =>
  `{ enable = lib.options.mkEnableOption ${nixString(plugin.description ?? '')};\n${settingOptions(plugin.settings)}\n}`;

const hasJsonAttrs = (settings: Settings): boolean =>
  Object.values(settings).some((setting) =>
    'settings' in setting ? hasJsonAttrs(setting.settings) : setting.type.includes('types.attrs')
  );

// Resolve schema precedence during generation, before the module imports options
export const compilePluginOptions = (categories: readonly Schemas[]): string => {
  const plugins: Record<string, PluginJson> = Object.create(null);
  for (const category of categories) {
    for (const [name, plugin] of Object.entries(category)) {
      const previous = plugins[name];
      plugins[name] = previous
        ? { ...previous, ...plugin, settings: mergeSettings(previous.settings, plugin.settings) }
        : plugin;
    }
  }
  const options = Object.entries(plugins)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([name, plugin]) => `${nixString(name)} = ${pluginOptions(plugin)};`)
    .join('\n');
  const bindings = Object.values(plugins).some((plugin) => hasJsonAttrs(plugin.settings))
    ? 'let jsonAttrs = lib.types.attrsOf lib.types.json; in\n'
    : '';
  const argument = Object.keys(plugins).length > 0 ? '{ lib }' : '_';
  return `# Generated by the plugin updater; edit overrides.json instead\n${argument}:\n${bindings}{\n${options}\n}\n`;
};

const settingPaths = (settings: Settings): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(settings).map(([name, setting]) => [
      name,
      'settings' in setting ? { settings: settingPaths(setting.settings) } : { type: setting.type },
    ])
  );

export const compilePluginPaths = (categories: Readonly<Record<string, Schemas>>): string =>
  `# Generated plugin and setting paths used by filtering and migrations\n${nixValue(
    Object.fromEntries(
      Object.entries(categories).map(([category, plugins]) => [
        category,
        Object.fromEntries(
          Object.entries(plugins).map(([name, plugin]) => [
            name,
            { settings: settingPaths(plugin.settings) },
          ])
        ),
      ])
    )
  )}\n`;
