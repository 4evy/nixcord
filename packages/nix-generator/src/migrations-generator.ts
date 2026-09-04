import type { DeprecatedData, PluginConfig, ReadonlyDeep } from '@nixcord/shared';
import { isNestedConfig, sortedEntries } from '@nixcord/shared';
import { toLegacyNixIdentifier, toNixIdentifier } from './identifier.js';

export interface MigrationRenameJson {
  from: string[];
  to: string[];
  warn: boolean;
}

export interface ClientMigrationRenameJson extends MigrationRenameJson {
  declare: boolean;
}

export interface MigrationsJson {
  renames: MigrationRenameJson[];
  identifierRenames: MigrationRenameJson[];
  removals: string[];
  settingRemovals?: string[][];
  clientRenames?: ClientMigrationRenameJson[];
}

interface SettingNamePair {
  legacy: string;
  current: string;
}

/**
 * Collect all leaf setting names from a plugin config (flattened).
 * Always includes "enable".
 */
function normalizeSettingPath(
  path: string,
  normalizer: (name: string) => string = toNixIdentifier
): string {
  return path.split('.').map(normalizer).join('.');
}

function normalizePathParts(
  path: string,
  normalizer: (name: string) => string = toNixIdentifier
): string[] {
  return path.split('.').map(normalizer);
}

function collectSettingNames(
  config: ReadonlyDeep<PluginConfig>,
  normalizer: (name: string) => string = toNixIdentifier
): string[] {
  const names = new Set<string>(['enable']);

  for (const [key, setting] of Object.entries(config.settings)) {
    const settingName = normalizer(
      'name' in setting && typeof setting.name === 'string' ? setting.name : key
    );
    if (isNestedConfig(setting)) {
      for (const nestedName of collectSettingNames(setting, normalizer)) {
        names.add(`${settingName}.${nestedName}`);
      }
    } else {
      names.add(settingName);
    }
  }

  return [...names];
}

function collectSettingNamePairs(config: ReadonlyDeep<PluginConfig>): SettingNamePair[] {
  const pairs: SettingNamePair[] = [{ legacy: 'enable', current: 'enable' }];

  for (const [key, setting] of Object.entries(config.settings)) {
    const rawName = 'name' in setting && typeof setting.name === 'string' ? setting.name : key;
    const legacyName = toLegacyNixIdentifier(rawName);
    const currentName = toNixIdentifier(rawName);

    if (isNestedConfig(setting)) {
      for (const nestedPair of collectSettingNamePairs(setting)) {
        pairs.push({
          legacy: `${legacyName}.${nestedPair.legacy}`,
          current: `${currentName}.${nestedPair.current}`,
        });
      }
    } else {
      pairs.push({ legacy: legacyName, current: currentName });
    }
  }

  const seen = new Set<string>();
  return pairs.filter((pair) => {
    const key = optionPathKey([pair.legacy, pair.current]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mkRenameEntry(
  oldPlugin: string,
  newPlugin: string,
  fromSettingPath: string,
  toSettingPath = fromSettingPath,
  warn = false,
  fromSettingNormalizer: (name: string) => string = toLegacyNixIdentifier,
  toSettingNormalizer: (name: string) => string = toNixIdentifier
): MigrationRenameJson {
  const oldId = toLegacyNixIdentifier(oldPlugin);
  const newId = toNixIdentifier(newPlugin);

  // Plugin options commonly have defaults. Warning aliases can therefore fire
  // during evaluation even when users never referenced the obsolete option.
  return {
    from: [oldId, ...normalizePathParts(fromSettingPath, fromSettingNormalizer)],
    to: [newId, ...normalizePathParts(toSettingPath, toSettingNormalizer)],
    warn,
  };
}

function optionPathKey(parts: readonly string[]): string {
  return parts.join('\u0000');
}

function collectActiveOptionPaths(
  sources: ReadonlyDeep<Record<string, PluginConfig>>[]
): Set<string> {
  const paths = new Set<string>();

  for (const source of sources) {
    for (const [pluginName, config] of Object.entries(source)) {
      const pluginId = toNixIdentifier(pluginName);
      for (const settingPath of collectSettingNames(config)) {
        paths.add(optionPathKey([pluginId, ...normalizePathParts(settingPath)]));
      }
    }
  }

  return paths;
}

function generateIdentifierRenames(
  sources: ReadonlyDeep<Record<string, PluginConfig>>[]
): MigrationRenameJson[] {
  const activeOptionPaths = collectActiveOptionPaths(sources);
  const renames = new Map<string, MigrationRenameJson>();

  for (const source of sources) {
    for (const [pluginName, config] of Object.entries(source)) {
      const legacyPluginId = toLegacyNixIdentifier(pluginName);
      const newPluginId = toNixIdentifier(pluginName);

      for (const settingPair of collectSettingNamePairs(config)) {
        const from = [legacyPluginId, ...normalizePathParts(settingPair.legacy, (name) => name)];
        const to = [newPluginId, ...normalizePathParts(settingPair.current, (name) => name)];
        const fromKey = optionPathKey(from);
        const toKey = optionPathKey(to);

        if (fromKey === toKey) continue;
        if (activeOptionPaths.has(fromKey)) continue;
        if (!activeOptionPaths.has(toKey)) continue;

        renames.set(`${fromKey}->${toKey}`, { from, to, warn: true });
      }
    }
  }

  return Array.from(renames.values()).sort((a, b) =>
    optionPathKey(a.from).localeCompare(optionPathKey(b.from))
  );
}

export function generateMigrationsData(
  deprecated: DeprecatedData,
  allPlugins: ReadonlyDeep<Record<string, PluginConfig>>,
  pluginSources?: ReadonlyDeep<Record<string, PluginConfig>>[]
): MigrationsJson {
  // Build lookup of active plugin nix identifiers to skip conflicting migrations
  const activeNixNames = new Set(Object.keys(allPlugins).map((k) => toNixIdentifier(k)));

  // Pre-filter setting rename entries, deduplicating by Nix identifier
  // Multiple source names (e.g. "platformIndicators" and "PlatformIndicators")
  // can map to the same Nix identifier, so we merge their settings.
  const settingRenamesByNixName = new Map<string, Record<string, string>>();
  for (const [pluginName, settings] of sortedEntries(deprecated.settingRenames ?? {})) {
    const nixName = toNixIdentifier(pluginName);
    if (!activeNixNames.has(nixName)) continue;
    const existing = settingRenamesByNixName.get(nixName) ?? {};
    Object.assign(existing, settings);
    settingRenamesByNixName.set(nixName, existing);
  }
  const settingRenameEntries = Array.from(settingRenamesByNixName.entries());

  const pluginsByNixName = new Map(
    Object.entries(allPlugins).map(([name, config]) => [toNixIdentifier(name), config])
  );
  const sources = pluginSources ?? [allPlugins];
  const activeOptionPathsBySource = sources.map((source) => collectActiveOptionPaths([source]));
  const activeOptionPaths = new Set(activeOptionPathsBySource.flatMap((paths) => [...paths]));

  // Keep plugin renames whose target still exists. Renames whose old name is
  // active in another client cannot alias `enable`, but can still expose any
  // non-conflicting target settings for old client-specific configurations.
  const renameEntries = [
    ...new Map(
      sortedEntries(deprecated.renames)
        .filter(([oldName, entry]) => {
          const newNixName = toNixIdentifier(entry.to);
          return activeNixNames.has(newNixName) && toNixIdentifier(oldName) !== newNixName;
        })
        .map(
          (entry) =>
            [`${toNixIdentifier(entry[0])}->${toNixIdentifier(entry[1].to)}`, entry] as const
        )
    ).values(),
  ];

  // Pre-compute removals while skipping plugin names that came back upstream.
  const removalEntries = sortedEntries(deprecated.removals).filter(
    ([pluginName]) => !activeNixNames.has(toNixIdentifier(pluginName))
  );
  const migrations: MigrationsJson = {
    renames: [],
    identifierRenames: [],
    removals: removalEntries.map(([pluginName]) => toLegacyNixIdentifier(pluginName)),
  };
  const clientRenames: ClientMigrationRenameJson[] = [];

  for (const [oldName, entry] of renameEntries) {
    const newName = entry.to;
    const oldNixName = toNixIdentifier(oldName);
    const newNixName = toNixIdentifier(newName);
    const oldNameIsActive = activeNixNames.has(oldNixName);
    const isClientSpecificRename =
      oldNameIsActive &&
      !sources.some((source) => {
        const sourceNames = new Set(Object.keys(source).map(toNixIdentifier));
        return sourceNames.has(oldNixName) && sourceNames.has(newNixName);
      });

    const targetPlugin = pluginsByNixName.get(newNixName);

    if (!targetPlugin) {
      // Target plugin not found in parsed data - just forward enable
      if (!oldNameIsActive) {
        migrations.renames.push(mkRenameEntry(oldName, newName, 'enable'));
      }
    } else {
      const settingPairs = collectSettingNamePairs(targetPlugin).sort((a, b) =>
        a.current.localeCompare(b.current)
      );
      for (const setting of settingPairs) {
        const migration = mkRenameEntry(
          oldName,
          newName,
          setting.legacy,
          setting.current,
          false,
          (name) => name,
          (name) => name
        );
        const fromKey = optionPathKey(migration.from);
        if (!oldNameIsActive) {
          migrations.renames.push(migration);
        } else if (isClientSpecificRename) {
          clientRenames.push({ ...migration, declare: !activeOptionPaths.has(fromKey) });
        }
      }
    }
  }
  // Build a lookup from nix identifier to ALL setting names across all plugin versions.
  // A plugin may exist in both vencord and equicord with different settings;
  // we need the union of all settings to detect conflicts correctly.
  const allSettingsByNixName = new Map<string, Set<string>>();
  migrations.identifierRenames = generateIdentifierRenames(sources);
  for (const source of sources) {
    for (const [name, config] of Object.entries(source)) {
      const nixName = toNixIdentifier(name);
      const existing = allSettingsByNixName.get(nixName) ?? new Set<string>();
      for (const s of collectSettingNames(config)) {
        existing.add(s);
      }
      allSettingsByNixName.set(nixName, existing);
    }
  }

  const settingRemovals = sortedEntries(deprecated.settingRemovals ?? {}).flatMap(
    ([pluginName, settings]) => {
      const nixName = toNixIdentifier(pluginName);
      if (!activeNixNames.has(nixName)) return [];
      const activeSettingNames = allSettingsByNixName.get(nixName) ?? new Set<string>();
      const renamedSettings = settingRenamesByNixName.get(nixName) ?? {};
      return sortedEntries(settings).flatMap(([settingName]) => {
        const normalizedSetting = normalizeSettingPath(settingName, toLegacyNixIdentifier);
        if (activeSettingNames.has(normalizedSetting) || renamedSettings[settingName]) return [];
        return [[nixName, ...normalizePathParts(normalizedSetting, (name) => name)]];
      });
    }
  );
  if (settingRemovals.length > 0) migrations.settingRemovals = settingRemovals;

  // Generate setting rename migrations
  for (const [nixName, settings] of settingRenameEntries) {
    // Filter out renames where the old setting name still exists on the active plugin,
    // as mkRenamedOptionModule would conflict with the existing option declaration.
    const activeSettingNames = allSettingsByNixName.get(nixName) ?? new Set<string>();

    const normalizedRenames = Object.entries(settings)
      .map(
        ([oldSetting, newSetting]) =>
          [
            normalizeSettingPath(oldSetting, toLegacyNixIdentifier),
            normalizeSettingPath(newSetting),
          ] as const
      )
      .sort(([a], [b]) => a.localeCompare(b));

    for (const [oldSetting, newSetting] of normalizedRenames) {
      const migration = mkRenameEntry(
        nixName,
        nixName,
        oldSetting,
        newSetting,
        true,
        (name) => name,
        (name) => name
      );
      if (!activeSettingNames.has(oldSetting)) {
        migrations.renames.push(migration);
        continue;
      }

      const fromKey = optionPathKey(migration.from);
      const toKey = optionPathKey(migration.to);
      const coexistsInOneSource = activeOptionPathsBySource.some(
        (paths) => paths.has(fromKey) && paths.has(toKey)
      );
      if (activeOptionPaths.has(toKey) && !coexistsInOneSource) {
        clientRenames.push({ ...migration, warn: false, declare: false });
      }
    }
  }

  if (clientRenames.length > 0) migrations.clientRenames = clientRenames;

  return migrations;
}

export function generateMigrationsJson(
  deprecated: DeprecatedData,
  allPlugins: ReadonlyDeep<Record<string, PluginConfig>>,
  pluginSources?: ReadonlyDeep<Record<string, PluginConfig>>[]
): string {
  return `${JSON.stringify(generateMigrationsData(deprecated, allPlugins, pluginSources), null, 2)}\n`;
}
