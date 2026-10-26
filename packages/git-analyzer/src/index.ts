import type { PluginMigrationInfo } from '@nixcord/domain';
import { REMOVAL_EXPIRY_DAYS, RENAME_EXPIRY_DAYS } from '@nixcord/domain';
import { Effect } from 'effect';
import { extractPluginDeletionsEffect, extractPluginRenamesEffect } from './history/history.js';
import { extractDeprecationsFromGitEffect } from './settings/settings.js';

export type {
  DeprecationInfo,
  HistoricalPluginRename as PluginRename,
  PluginDeletion,
  PluginMigrationInfo,
} from '@nixcord/domain';
export { extractPluginDeletions, extractPluginRenames } from './history/history.js';
export { extractDeprecationsFromGit } from './settings/settings.js';

export const extractPluginMigrationsEffect = (
  repoPath: string,
  pluginsDirs: string[]
): Effect.Effect<PluginMigrationInfo> =>
  Effect.all(
    {
      renames: extractPluginRenamesEffect(repoPath, pluginsDirs, RENAME_EXPIRY_DAYS),
      deletions: extractPluginDeletionsEffect(repoPath, pluginsDirs, REMOVAL_EXPIRY_DAYS),
      settingRemovals: extractDeprecationsFromGitEffect(repoPath, pluginsDirs),
    },
    { concurrency: 3 }
  );

export const extractPluginMigrations = (
  repoPath: string,
  pluginsDirs: string[]
): Promise<PluginMigrationInfo> =>
  Effect.runPromise(extractPluginMigrationsEffect(repoPath, pluginsDirs));
