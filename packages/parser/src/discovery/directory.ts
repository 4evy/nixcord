import type { ParseDiagnostic, PluginConfig, PluginRename, SettingRename } from '@nixcord/domain';
import { executeComponentSliceEffect } from '@nixcord/slice-executor';
import { type AnalysisSession, StaticEvaluator } from '@nixcord/typescript-analysis';
import { Effect, Semaphore } from 'effect';
import fg from 'fast-glob';
import { basename, dirname, normalize, relative } from 'pathe';
import { type PluginParseError, parseOperation } from '../errors/errors.js';
import { parseSinglePlugin } from '../plugin.js';
import type { SourceProfile } from '../profiles.js';

const EXECUTION_CONCURRENCY = 4;

export interface DirectoryParseResult {
  readonly plugins: Readonly<Record<string, PluginConfig>>;
  readonly settingRenames: SettingRename[];
  readonly pluginRenames: PluginRename[];
  readonly diagnostics: ParseDiagnostic[];
}

export const emptyDirectoryResult = (): DirectoryParseResult => ({
  plugins: {} as Readonly<Record<string, PluginConfig>>,
  settingRenames: [],
  pluginRenames: [],
  diagnostics: [],
});

export function parsePluginsFromDirectory(
  pluginsPath: string,
  profile: SourceProfile,
  session: AnalysisSession,
  executionMode: 'disabled' | 'fallback'
): Effect.Effect<DirectoryParseResult, PluginParseError> {
  return Effect.gen(function* () {
    const entryFiles = yield* parseOperation('discovery', pluginsPath, () =>
      fg([...profile.entryGlobs], {
        cwd: pluginsPath,
        absolute: true,
        onlyFiles: true,
      })
    );
    const entries = entryFiles
      .map((file) => {
        const relativeEntry = normalize(relative(pluginsPath, file));
        const isDirectoryEntry = /^index\.(?:ts|tsx)$/.test(basename(relativeEntry));
        return {
          file: normalize(file),
          pluginDir: isDirectoryEntry ? dirname(relativeEntry) : relativeEntry,
          sourceRoot: normalize(dirname(file)),
          isDirectoryEntry,
        };
      })
      .filter((entry) => entry.pluginDir !== '.')
      .sort((left, right) => left.pluginDir.localeCompare(right.pluginDir));

    const executionLimit = yield* Semaphore.make(EXECUTION_CONCURRENCY);
    const evaluator = new StaticEvaluator(session.checker, {
      constants: Object.fromEntries(
        Object.entries(profile.enumMemberFallbacks).flatMap(([enumName, members]) =>
          Object.entries(members).map(([memberName, value]) => [`${enumName}.${memberName}`, value])
        )
      ),
    });
    const results = yield* Effect.forEach(
      entries,
      ({ file, pluginDir, sourceRoot, isDirectoryEntry }) => {
        const entry = session.getSourceFile(file);
        if (!entry) return Effect.succeed(undefined);
        const pluginFiles = isDirectoryEntry
          ? session.sourceFiles.filter((sourceFile) =>
              sourceFile.getFilePath().startsWith(`${sourceRoot}/`)
            )
          : [entry];
        return parseOperation('analysis', file, (signal) =>
          parseSinglePlugin(pluginDir, sourceRoot, entry, pluginFiles, {
            profile,
            session,
            evaluator,
            executionMode,
            executeSlice: (component, options) =>
              Effect.runPromise(
                executionLimit.withPermit(
                  executeComponentSliceEffect(component, session.checker, options)
                ),
                { signal }
              ),
          })
        );
      },
      { concurrency: EXECUTION_CONCURRENCY }
    );

    return {
      plugins: Object.fromEntries(
        results.flatMap((result) => (result?.entry ? [result.entry] : []))
      ) as Readonly<Record<string, PluginConfig>>,
      settingRenames: results.flatMap((result) => result?.settingRenames ?? []),
      pluginRenames: results.flatMap((result) => result?.pluginRenames ?? []),
      diagnostics: results.flatMap((result) => result?.diagnostics ?? []),
    };
  });
}
