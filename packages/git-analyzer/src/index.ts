import { type ExecFileOptionsWithStringEncoding, execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { promisify } from 'node:util';
import { REMOVAL_EXPIRY_DAYS, RENAME_EXPIRY_DAYS } from '@nixcord/shared';
import { limitFunction } from 'p-limit';
import { ts } from 'ts-morph';

const execFileAsync = limitFunction<
  [file: string, args: readonly string[], options: ExecFileOptionsWithStringEncoding],
  { stdout: string; stderr: string }
>(promisify(execFile), { concurrency: 8 });

const COMMIT_PREFIX = 'COMMIT:';
const TYPESCRIPT_FILE_PATTERN = /\.(ts|tsx)$/;

type GitCommit = {
  hash: string;
  date: string;
};

export type DeprecationInfo = {
  plugin: string;
  setting: string;
  removed: boolean;
  commitDate: string;
  commitHash: string;
};

export type PluginRename = {
  oldName: string;
  newName: string;
  commitDate: string;
  commitHash: string;
};

export type PluginDeletion = {
  pluginName: string;
  commitDate: string;
  commitHash: string;
};

export type PluginMigrationInfo = {
  renames: PluginRename[];
  deletions: PluginDeletion[];
  settingRemovals?: DeprecationInfo[];
};

const hasGit = async (path: string): Promise<boolean> => {
  try {
    const result = await execFileAsync('git', ['rev-parse', '--show-toplevel'], { cwd: path });
    const [requestedRoot, gitRoot] = await Promise.all([
      realpath(path),
      realpath(result.stdout.trim()),
    ]);
    return requestedRoot === gitRoot;
  } catch {
    return false;
  }
};

const getRemovedSettings = async (
  repoPath: string,
  filePath: string,
  oldHash: string,
  newHash: string
): Promise<string[]> => {
  try {
    const [oldFile, newFile] = await Promise.all([
      execFileAsync('git', ['show', `${oldHash}:${filePath}`], { cwd: repoPath }),
      execFileAsync('git', ['show', `${newHash}:${filePath}`], { cwd: repoPath }),
    ]);
    const oldSettings = extractDeclaredSettings(oldFile.stdout, filePath);
    const newSettings = extractDeclaredSettings(newFile.stdout, filePath);
    return [...oldSettings].filter((setting) => !newSettings.has(setting));
  } catch {
    return [];
  }
};

const extractDeclaredSettings = (source: string, filePath: string): Set<string> => {
  const settings = new Set<string>();
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest);
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'definePluginSettings'
    ) {
      const argument = node.arguments[0];
      if (argument && ts.isObjectLiteralExpression(argument)) {
        for (const property of argument.properties) {
          const name = property.name;
          if (name && (ts.isIdentifier(name) || ts.isStringLiteral(name))) {
            settings.add(name.text);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return settings;
};

/**
 * Extract plugin directory name from a file path like "src/plugins/foo/index.ts"
 * Returns the directory name (e.g. "foo") or null if the path doesn't match.
 */
const extractPluginDirName = (filePath: string, pluginsDirs: string[]): string | null => {
  for (const dir of pluginsDirs) {
    const prefix = dir.endsWith('/') ? dir : `${dir}/`;
    if (filePath.startsWith(prefix)) {
      const rest = filePath.slice(prefix.length);
      const parts = rest.split('/');
      if (parts.length >= 2) {
        return parts[0].replace(/\.(?:desktop|web)$/, '');
      }
    }
  }
  return null;
};

/**
 * Build glob patterns for git commands targeting plugin index files.
 */
const buildPluginGlobs = (pluginsDirs: string[]): string[] => {
  return pluginsDirs.flatMap((dir) => [`:(glob)${dir}/*/index.ts`, `:(glob)${dir}/*/index.tsx`]);
};

const parseCommitHeader = (line: string): GitCommit | null => {
  if (!line.startsWith(COMMIT_PREFIX)) return null;

  const [hash, date] = line.slice(COMMIT_PREFIX.length).split('|');
  return { hash, date };
};

// With -z, status and paths are separate NUL-delimited fields. Only the
// status/header field has Git's formatting newline; filenames stay untouched.
const forEachCommitEntry = (
  stdout: string,
  visit: (status: string, paths: string[], currentCommit: GitCommit) => void
): void => {
  let currentCommit: GitCommit | null = null;
  const fields = stdout.split('\0');
  for (let index = 0; index < fields.length; index++) {
    const field = fields[index].replace(/^\n+/, '');
    if (!field) continue;
    const commit = parseCommitHeader(field);
    if (commit) {
      currentCommit = commit;
      continue;
    }
    if (!currentCommit || !/^[ACDMRTUXB][0-9]*$/.test(field)) {
      throw new Error('Unexpected git log record');
    }
    const count = /^[RC]/.test(field) ? 2 : 1;
    const paths = fields.slice(index + 1, index + 1 + count);
    if (paths.length !== count || paths.some((path) => !path)) {
      throw new Error('Incomplete git log record');
    }
    index += count;
    visit(field, paths, currentCommit);
  }
};

export const extractPluginRenames = async (
  repoPath: string,
  pluginsDirs: string[],
  days: number = RENAME_EXPIRY_DAYS
): Promise<PluginRename[]> => {
  if (!(await hasGit(repoPath))) return [];

  const globs = buildPluginGlobs(pluginsDirs);
  try {
    const renameResult = await execFileAsync(
      'git',
      [
        'log',
        `--since=${days} days ago`,
        '-M',
        '--diff-filter=R',
        '--name-status',
        '-z',
        '--no-color',
        '--no-ext-diff',
        '--no-textconv',
        '--pretty=format:COMMIT:%H|%cI%x00',
        '--',
        ...globs,
      ],
      { cwd: repoPath, maxBuffer: 10 * 1024 * 1024 }
    );
    if (!renameResult.stdout.trim()) return [];

    const renames: PluginRename[] = [];

    forEachCommitEntry(renameResult.stdout, (status, paths, currentCommit) => {
      if (status.startsWith('R')) {
        if (paths.length === 2) {
          const oldPath = paths[0];
          const newPath = paths[1];
          const oldName = extractPluginDirName(oldPath, pluginsDirs);
          const newName = extractPluginDirName(newPath, pluginsDirs);
          if (oldName && newName && oldName !== newName) {
            renames.push({
              oldName,
              newName,
              commitDate: currentCommit.date,
              commitHash: currentCommit.hash,
            });
          }
        }
      }
    });

    // Deduplicate: keep the most recent rename per old -> new pair
    const seen = new Map<string, PluginRename>();
    for (const rename of renames) {
      const key = `${rename.oldName}->${rename.newName}`;
      const existing = seen.get(key);
      if (!existing || new Date(rename.commitDate) > new Date(existing.commitDate)) {
        seen.set(key, rename);
      }
    }

    return Array.from(seen.values());
  } catch {
    return [];
  }
};

export const extractPluginDeletions = async (
  repoPath: string,
  pluginsDirs: string[],
  days: number = REMOVAL_EXPIRY_DAYS
): Promise<PluginDeletion[]> => {
  if (!(await hasGit(repoPath))) return [];

  const globs = buildPluginGlobs(pluginsDirs);
  try {
    const deleteResult = await execFileAsync(
      'git',
      [
        'log',
        `--since=${days} days ago`,
        '-M',
        '--diff-filter=D',
        '--name-status',
        '-z',
        '--no-color',
        '--no-ext-diff',
        '--no-textconv',
        '--pretty=format:COMMIT:%H|%cI%x00',
        '--',
        ...globs,
      ],
      { cwd: repoPath, maxBuffer: 10 * 1024 * 1024 }
    );
    if (!deleteResult.stdout.trim()) return [];

    // Also get renames so we can exclude renamed files from deletions
    const renames = await extractPluginRenames(repoPath, pluginsDirs, days);
    const renamedOldNamesLower = new Set(renames.map((r) => r.oldName.toLowerCase()));

    const deletions: PluginDeletion[] = [];

    forEachCommitEntry(deleteResult.stdout, (status, paths, currentCommit) => {
      if (status === 'D') {
        const filePath = paths[0];
        const pluginName = extractPluginDirName(filePath, pluginsDirs);
        if (pluginName && !renamedOldNamesLower.has(pluginName.toLowerCase())) {
          deletions.push({
            pluginName,
            commitDate: currentCommit.date,
            commitHash: currentCommit.hash,
          });
        }
      }
    });

    // Deduplicate: keep the most recent deletion per plugin name
    const seen = new Map<string, PluginDeletion>();
    for (const deletion of deletions) {
      const existing = seen.get(deletion.pluginName);
      if (!existing || new Date(deletion.commitDate) > new Date(existing.commitDate)) {
        seen.set(deletion.pluginName, deletion);
      }
    }

    return Array.from(seen.values());
  } catch {
    return [];
  }
};

export const extractPluginMigrations = async (
  repoPath: string,
  pluginsDirs: string[]
): Promise<PluginMigrationInfo> => {
  const [renames, deletions, settingRemovals] = await Promise.all([
    extractPluginRenames(repoPath, pluginsDirs, RENAME_EXPIRY_DAYS),
    extractPluginDeletions(repoPath, pluginsDirs, REMOVAL_EXPIRY_DAYS),
    extractDeprecationsFromGit(repoPath, pluginsDirs),
  ]);

  return { renames, deletions, settingRemovals };
};

export const extractDeprecationsFromGit = async (
  repoPath: string,
  pluginsDirs?: string[]
): Promise<DeprecationInfo[]> => {
  if (!(await hasGit(repoPath))) return [];

  const dirs = pluginsDirs ?? ['src/plugins'];
  const pathspecs = dirs.flatMap((dir) => [
    `:(glob)${dir}/*.ts`,
    `:(glob)${dir}/*.tsx`,
    `:(glob)${dir}/**/*.ts`,
    `:(glob)${dir}/**/*.tsx`,
  ]);

  let logOutput: string;
  try {
    const logResult = await execFileAsync(
      'git',
      [
        'log',
        `--since=${REMOVAL_EXPIRY_DAYS} days ago`,
        '-M',
        '--diff-filter=M',
        '--name-status',
        '-z',
        '--no-color',
        '--no-ext-diff',
        '--no-textconv',
        '--pretty=format:COMMIT:%H|%cI%x00',
        '--',
        ...pathspecs,
      ],
      { cwd: repoPath, maxBuffer: 10 * 1024 * 1024 }
    );
    logOutput = logResult.stdout;
  } catch {
    return [];
  }

  const commits = new Map<string, { date: string; files: Set<string> }>();
  forEachCommitEntry(logOutput, (_status, [file], commit) => {
    if (!TYPESCRIPT_FILE_PATTERN.test(file)) return;
    const current = commits.get(commit.hash) ?? { date: commit.date, files: new Set<string>() };
    current.files.add(file);
    commits.set(commit.hash, current);
  });

  const results = await Promise.all(
    [...commits].map(async ([hash, { date, files }]) => {
      const pluginFiles = [...files].filter(
        (file) =>
          TYPESCRIPT_FILE_PATTERN.test(file) &&
          dirs.some((dir) => file.startsWith(dir.endsWith('/') ? dir : `${dir}/`))
      );

      const deprecations = await Promise.all(
        pluginFiles.map(async (file) => {
          const pluginName = extractPluginDirName(file, dirs) ?? file.split('/')[2];
          const removed = await getRemovedSettings(repoPath, file, `${hash}^`, hash);

          return removed.map((setting) => ({
            plugin: pluginName,
            setting,
            removed: true,
            commitDate: date,
            commitHash: hash,
          }));
        })
      );

      return deprecations.flat();
    })
  );

  return results.flat();
};
