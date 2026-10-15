import type {
  DeprecatedData,
  DeprecatedRenameEntry,
  Logger,
  PluginConfig,
  PluginMigrationInfo,
  SettingRename,
} from '@nixcord/domain';
import { REMOVAL_EXPIRY_DAYS, RENAME_EXPIRY_DAYS, sortedEntries } from '@nixcord/domain';
import fse from 'fs-extra';
import { join } from 'pathe';
import * as v from 'valibot';

/** Plugin names must be valid Nix identifiers (no dots or other special chars) */
function isValidPluginName(name: string): boolean {
  return v.is(PluginNameSchema, name);
}

function isExpired(dateStr: string, expiryDays: number): boolean {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays > expiryDays;
}

// Persisted history is best-effort: keep valid entries even if another entry is malformed
const historyRecord = <T>(
  key: v.GenericSchema<unknown, string>,
  value: v.GenericSchema<unknown, T>
) => {
  const entrySchema = v.tuple([key, value]);
  return v.fallback(
    v.pipe(
      v.record(v.string(), v.unknown()),
      v.transform((record) =>
        Object.fromEntries(
          Object.entries(record).flatMap((entry) => {
            const result = v.safeParse(entrySchema, entry);
            return result.success ? [result.output] : [];
          })
        )
      )
    ),
    () => ({})
  );
};

const PluginNameSchema = v.pipe(v.string(), v.regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/));
const RemovalEntrySchema = v.object({ date: v.pipe(v.string(), v.minLength(1)) });
const DeprecatedHistorySchema = v.fallback(
  v.object({
    renames: historyRecord(
      PluginNameSchema,
      v.object({
        to: PluginNameSchema,
        date: v.fallback(v.optional(v.pipe(v.string(), v.minLength(1))), undefined),
      })
    ),
    removals: historyRecord(PluginNameSchema, RemovalEntrySchema),
    settingRenames: historyRecord(v.string(), v.record(v.string(), v.string())),
    settingRemovals: historyRecord(PluginNameSchema, historyRecord(v.string(), RemovalEntrySchema)),
  }),
  () => ({ renames: {}, removals: {}, settingRenames: {}, settingRemovals: {} })
);

async function readDeprecatedJson(filePath: string): Promise<DeprecatedData> {
  const parsed: unknown = await fse.readJson(filePath).catch(() => undefined);
  return v.parse(DeprecatedHistorySchema, parsed);
}

export function generateDeprecatedJson(data: DeprecatedData): string {
  const output: {
    renames: Record<string, { to: string; date?: string }>;
    removals: Record<string, { date: string }>;
    settingRenames: Record<string, Record<string, string>>;
    settingRemovals: Record<string, Record<string, { date: string }>>;
  } = {
    renames: {},
    removals: {},
    settingRenames: {},
    settingRemovals: {},
  };

  // Renames: permanent first, then dated (sorted)
  for (const [name, entry] of sortedEntries(data.renames).filter(([, v]) => !v.date)) {
    output.renames[name] = { to: entry.to };
  }
  for (const [name, entry] of sortedEntries(data.renames).filter(([, v]) => v.date)) {
    output.renames[name] = { to: entry.to, date: entry.date! };
  }

  for (const [name, entry] of sortedEntries(data.removals)) {
    output.removals[name] = { date: entry.date };
  }

  for (const [pluginName, settings] of sortedEntries(data.settingRenames)) {
    output.settingRenames[pluginName] = Object.fromEntries(sortedEntries(settings));
  }

  for (const [pluginName, settings] of sortedEntries(data.settingRemovals ?? {})) {
    output.settingRemovals[pluginName] = Object.fromEntries(sortedEntries(settings));
  }

  return `${JSON.stringify(output, null, 2)}\n`;
}

/**
 * Remove A -> B / B -> A pairs left by reversals in Git history
 */
function removeCircularRenames(renames: Record<string, DeprecatedRenameEntry>): void {
  const toRemove = new Set<string>();
  for (const [from, entry] of Object.entries(renames)) {
    if (toRemove.has(from)) continue;
    const to = entry.to;
    if (renames[to]?.to === from) {
      toRemove.add(from);
      toRemove.add(to);
    }
  }
  for (const name of toRemove) {
    delete renames[name];
  }
}

function removeSelfRenames(
  renames: Record<string, DeprecatedRenameEntry>,
  normalize: (name: string) => string
): void {
  for (const [from, entry] of Object.entries(renames)) {
    if (normalize(from) === normalize(entry.to)) {
      delete renames[from];
    }
  }
}

function collectSettingNames(config: Readonly<PluginConfig>, prefix = ''): Set<string> {
  const names = new Set<string>();
  for (const [key, setting] of Object.entries(config.settings)) {
    const name = prefix ? `${prefix}.${key}` : key;
    names.add(name);
    if ('settings' in setting) {
      for (const nestedName of collectSettingNames(setting, name)) names.add(nestedName);
    }
  }
  return names;
}

export async function updateDeprecatedPlugins(
  migrations: PluginMigrationInfo,
  pluginsDir: string,
  verbose: boolean,
  logger: Logger,
  settingRenames: SettingRename[] = [],
  activePluginNames?: Set<string>,
  normalizePluginName?: (name: string) => string,
  activePlugins?: Readonly<Record<string, PluginConfig>>
): Promise<DeprecatedData> {
  const deprecatedPath = join(pluginsDir, 'deprecated.json');
  const existing = await readDeprecatedJson(deprecatedPath);
  const normalize = normalizePluginName ?? ((n: string) => n);

  pruneExpiredHistory(existing);
  mergeObservedPluginHistory(existing, migrations, normalize);
  reconcilePluginHistory(existing, normalize, activePluginNames, normalizePluginName !== undefined);
  mergeObservedSettingRenames(existing, settingRenames, normalize);
  reconcileSettingHistory(existing, normalize, activePlugins);

  const json = generateDeprecatedJson(existing);
  await fse.writeFile(deprecatedPath, json);

  if (verbose) {
    const renameCount = Object.keys(existing.renames).length;
    const deletionCount = Object.keys(existing.removals).length;
    logger.info(`Updated deprecated.json: ${renameCount} renames, ${deletionCount} removals`);
  }

  return existing;
}

function pruneExpiredHistory(existing: DeprecatedData): void {
  // Prune expired history first so migrations still declared upstream can
  // replace their expired entries with the current observation date
  for (const [name, entry] of Object.entries(existing.renames)) {
    if (!entry.date || isExpired(entry.date, RENAME_EXPIRY_DAYS)) {
      delete existing.renames[name];
    }
  }
  for (const [name, entry] of Object.entries(existing.removals)) {
    if (isExpired(entry.date, REMOVAL_EXPIRY_DAYS)) {
      delete existing.removals[name];
    }
  }
  for (const [pluginName, settings] of Object.entries(existing.settingRemovals ?? {})) {
    for (const [settingName, entry] of Object.entries(settings)) {
      if (isExpired(entry.date, REMOVAL_EXPIRY_DAYS)) delete settings[settingName];
    }
    if (Object.keys(settings).length === 0) delete existing.settingRemovals![pluginName];
  }
}

function mergeObservedPluginHistory(
  existing: DeprecatedData,
  migrations: PluginMigrationInfo,
  normalize: (name: string) => string
): void {
  // Merge new renames (skip dot-named plugins, don't overwrite existing entries)
  for (const rename of migrations.renames) {
    if (!isValidPluginName(rename.oldName) || !isValidPluginName(rename.newName)) continue;
    const dateStr = rename.commitDate.split('T')[0];
    if (isExpired(dateStr, RENAME_EXPIRY_DAYS)) continue;
    if (!existing.renames[rename.oldName]) {
      existing.renames[rename.oldName] = { to: rename.newName, date: dateStr };
    }
  }

  // Merge new deletions (skip dot-named plugins)
  for (const deletion of migrations.deletions) {
    if (!isValidPluginName(deletion.pluginName)) continue;
    const dateStr = deletion.commitDate.split('T')[0];
    if (isExpired(dateStr, REMOVAL_EXPIRY_DAYS)) continue;
    if (!existing.removals[deletion.pluginName]) {
      existing.removals[deletion.pluginName] = { date: dateStr };
    }
  }

  // Merge settings removed from active plugins
  for (const removal of migrations.settingRemovals ?? []) {
    if (!isValidPluginName(removal.plugin) || !isValidPluginName(removal.setting)) continue;
    const dateStr = removal.commitDate.split('T')[0];
    if (isExpired(dateStr, REMOVAL_EXPIRY_DAYS)) continue;
    const pluginName = normalize(removal.plugin);
    const settings = (existing.settingRemovals ??= {})[pluginName] ?? {};
    settings[removal.setting] ??= { date: dateStr };
    existing.settingRemovals[pluginName] = settings;
  }
}

function reconcilePluginHistory(
  existing: DeprecatedData,
  normalize: (name: string) => string,
  activePluginNames: Set<string> | undefined,
  normalizeNames: boolean
): void {
  removeCircularRenames(existing.renames);

  if (activePluginNames && normalizeNames) {
    const activeNameByNormalizedName = new Map(
      [...activePluginNames].map((name) => [normalize(name), name])
    );
    const activeNameByLowercaseName = new Map(
      [...activePluginNames].map((name) => [name.toLowerCase(), name])
    );
    for (const entry of Object.values(existing.renames)) {
      entry.to =
        activeNameByNormalizedName.get(normalize(entry.to)) ??
        activeNameByLowercaseName.get(entry.to.toLowerCase()) ??
        entry.to;
    }
  }
  removeSelfRenames(existing.renames, normalize);

  // A rename must not also remove the plugin. Compare names without case
  // because Git history may contain different spellings
  const renameKeysLower = new Map(Object.keys(existing.renames).map((k) => [k.toLowerCase(), k]));
  for (const name of Object.keys(existing.removals)) {
    if (existing.renames[name] || renameKeysLower.has(name.toLowerCase())) {
      delete existing.removals[name];
    }
  }

  // An active plugin may appear deleted in Git after a file move
  if (activePluginNames) {
    const normalizedActiveNames = new Set([...activePluginNames].map(normalize));
    for (const name of Object.keys(existing.removals)) {
      if (normalizedActiveNames.has(normalize(name))) {
        delete existing.removals[name];
      }
    }
  }
}

function mergeObservedSettingRenames(
  existing: DeprecatedData,
  settingRenames: SettingRename[],
  normalize: (name: string) => string
): void {
  // Merge setting renames from migratePluginSetting() calls
  for (const rename of settingRenames) {
    const nixName = normalize(rename.pluginName);
    if (!existing.settingRenames[nixName]) {
      existing.settingRenames[nixName] = {};
    }
    const renames = existing.settingRenames[nixName];
    if (renames[rename.newSetting] === rename.oldSetting) delete renames[rename.newSetting];
    renames[rename.oldSetting] = rename.newSetting;
    delete existing.settingRemovals?.[nixName]?.[rename.oldSetting];
    if (Object.keys(existing.settingRemovals?.[nixName] ?? {}).length === 0) {
      delete existing.settingRemovals?.[nixName];
    }
  }
}

function reconcileSettingHistory(
  existing: DeprecatedData,
  normalize: (name: string) => string,
  activePlugins: Readonly<Record<string, PluginConfig>> | undefined
): void {
  // Deduplicate settingRenames by normalized name (e.g. "PlatformIndicators" ->
  // "platformIndicators")
  {
    const deduped: Record<string, Record<string, string>> = {};
    for (const [key, settings] of Object.entries(existing.settingRenames)) {
      const nixKey = normalize(key);
      if (!deduped[nixKey]) {
        deduped[nixKey] = {};
      }
      Object.assign(deduped[nixKey], settings);
    }
    existing.settingRenames = deduped;
  }

  // Use the current schema to resolve circular pairs left by older generators
  // that read an upstream migration in the wrong direction
  if (activePlugins) {
    const activeSettingsByPlugin = new Map(
      Object.entries(activePlugins).map(([name, config]) => [
        normalize(name),
        collectSettingNames(config),
      ])
    );
    for (const [pluginName, renames] of Object.entries(existing.settingRenames)) {
      const activeSettings = activeSettingsByPlugin.get(normalize(pluginName));
      if (!activeSettings) continue;
      for (const [from, to] of Object.entries(renames)) {
        if (renames[to] !== from) continue;
        if (activeSettings.has(to) && !activeSettings.has(from)) delete renames[to];
        else if (activeSettings.has(from) && !activeSettings.has(to)) delete renames[from];
      }
    }
  }
}
