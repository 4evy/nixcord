import { type ExecFileOptionsWithStringEncoding, execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { promisify } from 'node:util';
import { Data, Effect, Semaphore } from 'effect';

const execute = promisify(execFile);
const permits = Semaphore.makeUnsafe(8);

class GitCommandError extends Data.TaggedError('GitCommandError')<{
  readonly message: string;
  readonly cause: unknown;
}> {}

export const gitCommand = (args: readonly string[], options: ExecFileOptionsWithStringEncoding) =>
  permits.withPermit(
    Effect.tryPromise({
      try: (signal) => execute('git', args, { ...options, signal }),
      catch: (cause) =>
        new GitCommandError({
          cause,
          message: cause instanceof Error ? cause.message : String(cause),
        }),
    })
  );

export const hasGit = (path: string): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const result = yield* gitCommand(['rev-parse', '--show-toplevel'], { cwd: path });
    const [requestedRoot, gitRoot] = yield* Effect.all(
      [path, result.stdout.trim()].map((root) => Effect.tryPromise(() => realpath(root))),
      { concurrency: 2 }
    );
    return requestedRoot === gitRoot;
  }).pipe(Effect.catch(() => Effect.succeed(false)));

export const gitLog = ({
  repoPath,
  days,
  diffFilter,
  pathspecs,
}: {
  readonly repoPath: string;
  readonly days: number;
  readonly diffFilter: 'R' | 'D' | 'M';
  readonly pathspecs: readonly string[];
}) =>
  gitCommand(
    [
      'log',
      `--since=${days} days ago`,
      '--find-renames',
      `--diff-filter=${diffFilter}`,
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
  ).pipe(Effect.map(({ stdout }) => stdout));
