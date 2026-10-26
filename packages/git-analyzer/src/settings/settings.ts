import { resolve } from 'node:path';
import type { DeprecationInfo } from '@nixcord/domain';
import { REMOVAL_EXPIRY_DAYS } from '@nixcord/domain';
import { createAnalysisSession, SyntaxKind } from '@nixcord/typescript-analysis';
import { Array as Arr, Effect } from 'effect';
import { gitCommand, gitLog, hasGit } from '../git/git.js';
import { extractPluginDirName, parseCommitEntries, pluginDirectoryPrefix } from '../log/log.js';

const TYPESCRIPT_FILE_PATTERN = /\.(ts|tsx)$/;

const extractDeclaredSettings = (repoPath: string, source: string, filePath: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const path = resolve(repoPath, filePath);
      const session = yield* Effect.acquireDisposable(
        Effect.tryPromise(() =>
          createAnalysisSession({
            rootPath: repoPath,
            filePaths: [path],
            sources: { [path]: source },
            resolveBindings: false,
          })
        )
      );
      return yield* Effect.try(() => {
        const file = session.getSourceFile(path);
        if (!file) throw new Error(`Native TypeScript did not open ${path}`);
        return new Set(
          file.getDescendantsOfKind(SyntaxKind.CallExpression).flatMap((call) => {
            const expression = call.getExpression();
            if (
              !expression.isKind(SyntaxKind.Identifier) ||
              expression.getText() !== 'definePluginSettings'
            )
              return [];
            const argument = call.getArguments()[0]?.asKind(SyntaxKind.ObjectLiteralExpression);
            return (argument?.getProperties() ?? []).flatMap((property) => {
              if (property.isKind(SyntaxKind.SpreadAssignment)) return [];
              const name = property.getNameNode();
              return name.isKind(SyntaxKind.Identifier) || name.isKind(SyntaxKind.StringLiteral)
                ? [property.getName()]
                : [];
            });
          })
        );
      });
    })
  );

const getRemovedSettings = (
  repoPath: string,
  filePath: string,
  oldHash: string,
  newHash: string
): Effect.Effect<string[]> =>
  Effect.gen(function* () {
    const [oldFile, newFile] = yield* Effect.all(
      [oldHash, newHash].map((hash) =>
        gitCommand(['show', `${hash}:${filePath}`], { cwd: repoPath })
      ),
      { concurrency: 2 }
    );
    const [oldSettings, newSettings] = yield* Effect.all(
      [oldFile, newFile].map(({ stdout }) => extractDeclaredSettings(repoPath, stdout, filePath)),
      { concurrency: 2 }
    );
    return [...oldSettings].filter((setting) => !newSettings.has(setting));
  }).pipe(Effect.catch(() => Effect.succeed([])));

export const extractDeprecationsFromGitEffect = (
  repoPath: string,
  pluginsDirs: string[] = ['src/plugins']
): Effect.Effect<DeprecationInfo[]> =>
  Effect.gen(function* () {
    if (!(yield* hasGit(repoPath))) return [];
    const pathspecs = pluginsDirs.flatMap((directory) =>
      ['*.ts', '*.tsx', '**/*.ts', '**/*.tsx'].map(
        (glob) => `:(glob)${pluginDirectoryPrefix(directory)}${glob}`
      )
    );
    const stdout = yield* gitLog({
      repoPath,
      days: REMOVAL_EXPIRY_DAYS,
      diffFilter: 'M',
      pathspecs,
    });
    const entries = yield* Effect.try(() => parseCommitEntries(stdout));
    const changedFiles = Arr.dedupe(
      entries.flatMap(({ paths, commit }) =>
        paths
          .filter(
            (file) =>
              TYPESCRIPT_FILE_PATTERN.test(file) &&
              pluginsDirs.some((directory) => file.startsWith(pluginDirectoryPrefix(directory)))
          )
          .map((file) => ({ ...commit, file }))
      )
    );
    const results = yield* Effect.forEach(
      changedFiles,
      ({ hash, date, file }) =>
        getRemovedSettings(repoPath, file, `${hash}^`, hash).pipe(
          Effect.map((removed) =>
            removed.map((setting) => ({
              plugin: extractPluginDirName(file, pluginsDirs) ?? file.split('/')[2],
              setting,
              removed: true,
              commitDate: date,
              commitHash: hash,
            }))
          )
        ),
      // Each comparison opens two compiler sessions; bound those as well as Git commands
      { concurrency: 4 }
    );
    return results.flat();
  }).pipe(Effect.catch(() => Effect.succeed([])));

export const extractDeprecationsFromGit = (
  repoPath: string,
  pluginsDirs?: string[]
): Promise<DeprecationInfo[]> =>
  Effect.runPromise(extractDeprecationsFromGitEffect(repoPath, pluginsDirs));
