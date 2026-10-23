import { posix } from 'node:path';

const COMMIT_PREFIX = 'COMMIT:';

type GitCommit = {
  hash: string;
  date: string;
};

export interface GitCommitEntry {
  readonly status: string;
  readonly paths: readonly string[];
  readonly commit: GitCommit;
}

// Git emits repository-relative paths even when callers use ./ or .. segments
export const pluginDirectoryPrefix = (directory: string): string => {
  const normalized = posix.normalize(directory);
  return normalized === '.' ? '' : `${normalized.replace(/\/$/, '')}/`;
};

/**
 * Return the plugin directory ("foo" in "src/plugins/foo/index.ts"),
 * or null when the path is not a plugin entry point
 */
export const extractPluginDirName = (filePath: string, pluginsDirs: string[]): string | null => {
  for (const dir of pluginsDirs) {
    const prefix = pluginDirectoryPrefix(dir);
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

export const buildPluginGlobs = (pluginsDirs: string[]): string[] => {
  return pluginsDirs.flatMap((dir) =>
    ['ts', 'tsx'].map((extension) => `:(glob)${pluginDirectoryPrefix(dir)}*/index.${extension}`)
  );
};

const parseCommitHeader = (line: string): GitCommit | null => {
  if (!line.startsWith(COMMIT_PREFIX)) return null;

  const [hash, date] = line.slice(COMMIT_PREFIX.length).split('|');
  return { hash, date };
};

// With -z, status and paths are separate NUL-delimited fields. Only the
// status/header field has Git's formatting newline; filenames stay untouched
export const parseCommitEntries = (stdout: string): GitCommitEntry[] => {
  const entries: GitCommitEntry[] = [];
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
    entries.push({ status: field, paths, commit: currentCommit });
  }
  return entries;
};
