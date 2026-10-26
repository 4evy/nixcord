import type { PluginDeletion, HistoricalPluginRename as PluginRename } from '@nixcord/domain';
import { REMOVAL_EXPIRY_DAYS, RENAME_EXPIRY_DAYS } from '@nixcord/domain';
import { Array as Arr, Effect } from 'effect';
import { gitLog, hasGit } from '../git/git.js';
import { buildPluginGlobs, extractPluginDirName, parseCommitEntries } from '../log/log.js';

const newestBy = <T extends { readonly commitDate: string }>(
  entries: readonly T[],
  key: (entry: T) => string
): T[] =>
  Object.values(Arr.groupBy(entries, key)).map((group) =>
    group.reduce((latest, entry) =>
      new Date(entry.commitDate) > new Date(latest.commitDate) ? entry : latest
    )
  );

const historyEntries = (
  repoPath: string,
  pluginsDirs: string[],
  days: number,
  diffFilter: 'R' | 'D'
) =>
  gitLog({ repoPath, days, diffFilter, pathspecs: buildPluginGlobs(pluginsDirs) }).pipe(
    Effect.flatMap((stdout) => Effect.try(() => parseCommitEntries(stdout)))
  );

export const extractPluginRenamesEffect = (
  repoPath: string,
  pluginsDirs: string[],
  days: number = RENAME_EXPIRY_DAYS
): Effect.Effect<PluginRename[]> =>
  Effect.gen(function* () {
    if (!(yield* hasGit(repoPath))) return [];
    const entries = yield* historyEntries(repoPath, pluginsDirs, days, 'R');
    const renames = entries.flatMap(({ status, paths, commit }) => {
      if (!status.startsWith('R') || paths.length !== 2) return [];
      const oldName = extractPluginDirName(paths[0], pluginsDirs);
      const newName = extractPluginDirName(paths[1], pluginsDirs);
      return oldName && newName && oldName !== newName
        ? [{ oldName, newName, commitDate: commit.date, commitHash: commit.hash }]
        : [];
    });
    return newestBy(renames, ({ oldName, newName }) => JSON.stringify([oldName, newName]));
  }).pipe(Effect.catch(() => Effect.succeed([])));

export const extractPluginDeletionsEffect = (
  repoPath: string,
  pluginsDirs: string[],
  days: number = REMOVAL_EXPIRY_DAYS
): Effect.Effect<PluginDeletion[]> =>
  Effect.gen(function* () {
    if (!(yield* hasGit(repoPath))) return [];
    const { entries, renames } = yield* Effect.all(
      {
        entries: historyEntries(repoPath, pluginsDirs, days, 'D'),
        renames: extractPluginRenamesEffect(repoPath, pluginsDirs, days),
      },
      { concurrency: 2 }
    );
    // Renamed files must not produce removal migrations
    const renamedOldNamesLower = new Set(renames.map((rename) => rename.oldName.toLowerCase()));
    const deletions = entries.flatMap(({ status, paths, commit }) => {
      if (status !== 'D') return [];
      const pluginName = extractPluginDirName(paths[0], pluginsDirs);
      return pluginName && !renamedOldNamesLower.has(pluginName.toLowerCase())
        ? [{ pluginName, commitDate: commit.date, commitHash: commit.hash }]
        : [];
    });
    return newestBy(deletions, ({ pluginName }) => pluginName);
  }).pipe(Effect.catch(() => Effect.succeed([])));

export const extractPluginRenames = (
  repoPath: string,
  pluginsDirs: string[],
  days: number = RENAME_EXPIRY_DAYS
): Promise<PluginRename[]> =>
  Effect.runPromise(extractPluginRenamesEffect(repoPath, pluginsDirs, days));

export const extractPluginDeletions = (
  repoPath: string,
  pluginsDirs: string[],
  days: number = REMOVAL_EXPIRY_DAYS
): Promise<PluginDeletion[]> =>
  Effect.runPromise(extractPluginDeletionsEffect(repoPath, pluginsDirs, days));
