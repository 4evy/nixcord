import type { ParsedPluginsResult } from '@nixcord/domain';
import { createAnalysisSession } from '@nixcord/typescript-analysis';
import { Effect, Record, Schema } from 'effect';
import fg from 'fast-glob';
import fse from 'fs-extra';
import { join, normalize, resolve } from 'pathe';
import { emptyDirectoryResult, parsePluginsFromDirectory } from './discovery/directory.js';
import { PluginParseError, parseOperation } from './errors/errors.js';
import { SOURCE_PROFILES } from './profiles.js';

const ParsePluginsOptionsSchema = Schema.Struct({
  vencordPluginsDir: Schema.optional(Schema.NonEmptyString),
  equicordPluginsDir: Schema.optional(Schema.NonEmptyString),
  executionMode: Schema.optional(Schema.Literals(['disabled', 'fallback'])),
});

export type ParsePluginsOptions = typeof ParsePluginsOptionsSchema.Type;

const sourceFilesForAnalysis = async (
  sourcePath: string,
  pluginDirectories: readonly string[]
): Promise<string[]> => {
  const profiles = Object.values(SOURCE_PROFILES);
  const globs = [
    ...pluginDirectories.map((directory) => `${directory}/**/*.{ts,tsx}`),
    ...profiles.flatMap((profile) => profile.supportGlobs),
  ];
  return (await fg(globs, { cwd: sourcePath, absolute: true, onlyFiles: true })).sort((a, b) =>
    a.localeCompare(b)
  );
};

export function parsePluginsEffect(
  sourcePath: string,
  options: ParsePluginsOptions = {}
): Effect.Effect<ParsedPluginsResult, PluginParseError> {
  return Effect.scoped(
    Effect.gen(function* () {
      const resolvedSourcePath = resolve(sourcePath);
      const validated = yield* Schema.decodeUnknownEffect(ParsePluginsOptionsSchema)(options).pipe(
        Effect.mapError(
          (cause) =>
            new PluginParseError({
              stage: 'options',
              sourcePath: resolvedSourcePath,
              message: cause.message,
              cause,
            })
        )
      );
      const overrides = {
        vencord: validated.vencordPluginsDir,
        equicord: validated.equicordPluginsDir,
      };
      const sources = yield* Effect.all(
        Record.map(SOURCE_PROFILES, (profile, kind) => {
          const directory = overrides[kind] ?? profile.pluginsDirectory;
          const path = normalize(join(resolvedSourcePath, directory));
          return parseOperation('discovery', path, () => fse.pathExists(path)).pipe(
            Effect.map((exists) => ({ profile, directory, path, exists }))
          );
        }),
        { concurrency: 2 }
      );
      const available = Object.values(sources).filter((source) => source.exists);
      if (available.length === 0) {
        return yield* Effect.fail(
          new PluginParseError({
            stage: 'discovery',
            sourcePath: resolvedSourcePath,
            message: `No plugins directories found. Expected one of:\n${Object.values(sources)
              .map(({ path }) => `  - ${path}`)
              .join('\n')}`,
            cause: undefined,
          })
        );
      }

      const filePaths = yield* parseOperation('discovery', resolvedSourcePath, () =>
        sourceFilesForAnalysis(
          resolvedSourcePath,
          available.map(({ directory }) => directory)
        )
      );
      const session = yield* Effect.acquireDisposable(
        parseOperation('session', resolvedSourcePath, () =>
          createAnalysisSession({
            rootPath: resolvedSourcePath,
            filePaths,
            tsConfigPath: normalize(join(resolvedSourcePath, 'tsconfig.json')),
          })
        )
      );
      const executionMode = validated.executionMode ?? 'fallback';
      const results = yield* Effect.all(
        Record.map(sources, ({ exists, path, profile }) =>
          exists
            ? parsePluginsFromDirectory(path, profile, session, executionMode)
            : Effect.succeed(emptyDirectoryResult())
        ),
        { concurrency: 1 }
      );
      const parsed = Object.values(results);

      return {
        vencordPlugins: results.vencord.plugins,
        equicordPlugins: results.equicord.plugins,
        settingRenames: parsed.flatMap((result) => result.settingRenames),
        pluginRenames: parsed.flatMap((result) => result.pluginRenames),
        diagnostics: parsed.flatMap((result) => result.diagnostics),
      };
    })
  );
}

export function parsePlugins(
  sourcePath: string,
  options: ParsePluginsOptions = {}
): Promise<ParsedPluginsResult> {
  return Effect.runPromise(parsePluginsEffect(sourcePath, options));
}
