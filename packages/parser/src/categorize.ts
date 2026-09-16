import type { ParsedPluginsResult, PluginConfig } from '@nixcord/shared';
import { SOURCE_PROFILES } from './source-profiles.js';

const PLUGIN_RENAME_MAP: Record<string, string> = { oneko: 'CursorBuddy' };
const CLIENT_SPECIFIC_PLUGINS = new Set(
  Object.values(SOURCE_PROFILES).flatMap((profile) => profile.clientSpecificPlugins)
);

const collectSettingSurface = (config: PluginConfig): readonly string[] => {
  const entries: string[] = [];
  const collect = (settings: PluginConfig['settings'], parentPath = '') => {
    for (const [key, setting] of Object.entries(settings)) {
      const name = setting.name ?? key;
      const path = parentPath ? `${parentPath}.${name}` : name;
      if ('settings' in setting) {
        collect(setting.settings, path);
      } else {
        const type =
          setting.type.kind === 'enum'
            ? { kind: setting.type.kind, values: setting.type.values }
            : setting.type;
        entries.push(`${path}:${JSON.stringify(type)}`);
      }
    }
  };
  collect(config.settings);
  return entries.sort();
};

const hasSameSettingSurface = (left: PluginConfig, right: PluginConfig): boolean => {
  const leftNames = collectSettingSurface(left);
  const rightNames = collectSettingSurface(right);
  return (
    leftNames.length === rightNames.length && leftNames.every((name, i) => name === rightNames[i])
  );
};

export function categorizePlugins(
  vencordResult: Readonly<ParsedPluginsResult>,
  equicordResult?: Readonly<ParsedPluginsResult>
): {
  readonly generic: Readonly<Record<string, PluginConfig>>;
  readonly vencordOnly: Readonly<Record<string, PluginConfig>>;
  readonly equicordOnly: Readonly<Record<string, PluginConfig>>;
} {
  const vencordPlugins = vencordResult.vencordPlugins;
  const equicordSharedPlugins = equicordResult?.vencordPlugins ?? {};
  const equicordOnlyPlugins = equicordResult?.equicordPlugins ?? {};

  const equicordDirectoryMap = new Map(
    Object.entries(equicordSharedPlugins).flatMap(([name, config]) =>
      config.directoryName === undefined ? [] : [[config.directoryName.toLowerCase(), name]]
    )
  );

  const pluginMatches = Object.entries(vencordPlugins).map(([name, config]) => {
    const getEquicordConfig = (): PluginConfig | undefined => {
      const existing = equicordSharedPlugins[name];
      if (existing) return existing;

      const renamedPlugin = PLUGIN_RENAME_MAP[name];
      if (renamedPlugin) {
        return equicordOnlyPlugins[renamedPlugin] || equicordSharedPlugins[renamedPlugin];
      }

      const dirName = config?.directoryName;
      if (typeof dirName === 'string') {
        const equicordName = equicordDirectoryMap.get(dirName.toLowerCase());
        if (equicordName) {
          return equicordSharedPlugins[equicordName];
        }
      }

      return undefined;
    };

    return { name, config, equicordConfig: getEquicordConfig() };
  });

  const genericMatches = pluginMatches.filter(
    ({ config, equicordConfig }) =>
      equicordConfig !== undefined &&
      !CLIENT_SPECIFIC_PLUGINS.has(config.name) &&
      !equicordConfig.isModified &&
      hasSameSettingSurface(config, equicordConfig)
  );
  const vencordMatches = pluginMatches.filter(
    ({ config, equicordConfig }) =>
      equicordConfig === undefined ||
      CLIENT_SPECIFIC_PLUGINS.has(config.name) ||
      equicordConfig.isModified ||
      !hasSameSettingSurface(config, equicordConfig)
  );

  const genericTuples = genericMatches.map(
    ({ name, equicordConfig }) => [name, equicordConfig!] as [string, PluginConfig]
  );

  const vencordTuples = vencordMatches.map(
    ({ name, config }) => [name, config] as [string, PluginConfig]
  );

  const matchedEquicordPluginNames = new Set(
    genericMatches
      .map(({ equicordConfig }) => equicordConfig!.name)
      .filter((name) => name !== undefined)
  );

  const modifiedEquicordSharedPluginNames = new Set(
    vencordMatches
      .map(({ equicordConfig }) => equicordConfig?.name)
      .filter(
        (name): name is string => name !== undefined && equicordSharedPlugins[name] !== undefined
      )
  );

  const filteredEquicordOnly = Object.fromEntries(
    Object.entries(equicordOnlyPlugins).filter(
      ([name]) =>
        !matchedEquicordPluginNames.has(name) && !modifiedEquicordSharedPluginNames.has(name)
    )
  );

  const modifiedSharedPlugins = Object.fromEntries(
    Object.entries(equicordSharedPlugins).filter(([name]) =>
      modifiedEquicordSharedPluginNames.has(name)
    )
  );

  // Plugins that live in Equicord's `src/plugins` but have no Vencord counterpart
  // would otherwise be silently dropped because the categorizer only iterates
  // Vencord's plugin list above.
  const renamedEquicordTargets = new Set(Object.values(PLUGIN_RENAME_MAP));
  const equicordSharedExtras = Object.fromEntries(
    Object.entries(equicordSharedPlugins).filter(
      ([name]) =>
        vencordPlugins[name] === undefined &&
        !matchedEquicordPluginNames.has(name) &&
        !modifiedEquicordSharedPluginNames.has(name) &&
        !renamedEquicordTargets.has(name)
    )
  );

  return {
    generic: Object.fromEntries(genericTuples),
    vencordOnly: Object.fromEntries(vencordTuples),
    equicordOnly: {
      ...filteredEquicordOnly,
      ...modifiedSharedPlugins,
      ...equicordSharedExtras,
    },
  };
}
