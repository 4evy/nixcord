import type { ParsedPluginsResult } from '@nixcord/domain';
import { extractPluginMigrationsEffect } from '@nixcord/git-analyzer';
import {
  generateMigrationsJson,
  toNixIdentifier,
  updateDeprecatedPlugins,
} from '@nixcord/nix-generator';
import { CLI_CONFIG } from '@nixcord/shared';
import { Effect } from 'effect';
import fse from 'fs-extra';
import { resolve } from 'pathe';
import { type GeneratePluginOptionsError, generationStep, generationValue } from './errors.js';
import { getPluginsDir } from './outputs.js';
import type { GeneratePluginOptionsParams } from './params.js';

export function writeMigrations(
  params: GeneratePluginOptionsParams,
  resolvedVencordPath: string,
  resolvedEquicordPath: string | undefined,
  vencordResult: ParsedPluginsResult,
  equicordResult: ParsedPluginsResult | undefined,
  categorized: ReturnType<typeof import('@nixcord/parser').categorizePlugins>
): Effect.Effect<void, GeneratePluginOptionsError> {
  return Effect.gen(function* () {
    const verbose = params.verbose ?? false;
    const pluginsDir = getPluginsDir(params.outputPath);

    // Nix builds skip Git migrations so fetched sources need no .git directory
    // CI extracts them from full clones and saves the migration JSON
    const vencordMigrations = params.skipGitMigrations
      ? { renames: [], deletions: [] }
      : yield* extractPluginMigrationsEffect(resolvedVencordPath, [params.vencordPluginsDir]);
    const equicordMigrations = params.skipGitMigrations
      ? { renames: [], deletions: [] }
      : resolvedEquicordPath
        ? yield* extractPluginMigrationsEffect(resolvedEquicordPath, [
            params.vencordPluginsDir,
            params.equicordPluginsDir,
          ])
        : { renames: [], deletions: [] };

    const sourcePluginRenames = [
      ...(vencordResult.pluginRenames ?? []),
      ...(equicordResult?.pluginRenames ?? []),
    ].map((rename) => ({
      ...rename,
      commitDate: new Date().toISOString(),
      commitHash: 'source-migration',
    }));

    // Combine migrations from both repos and explicit migratePluginSettings() calls
    const combinedMigrations = {
      renames: [
        ...vencordMigrations.renames,
        ...equicordMigrations.renames,
        ...sourcePluginRenames,
      ],
      deletions: [...vencordMigrations.deletions, ...equicordMigrations.deletions],
      settingRemovals: [
        ...(vencordMigrations.settingRemovals ?? []),
        ...(equicordMigrations.settingRemovals ?? []),
      ],
    };

    const allSettingRenames = [
      ...(vencordResult.settingRenames ?? []),
      ...(equicordResult?.settingRenames ?? []),
    ];

    const allPlugins = {
      ...categorized.generic,
      ...categorized.vencordOnly,
      ...categorized.equicordOnly,
    };

    // Active plugins may appear deleted after a file move; exclude those removals
    const activePluginNames = new Set(Object.keys(allPlugins));

    const deprecated = yield* generationStep('migrations', () =>
      updateDeprecatedPlugins(
        combinedMigrations,
        pluginsDir,
        verbose,
        params.logger,
        allSettingRenames,
        activePluginNames,
        toNixIdentifier,
        allPlugins
      )
    );
    const migrationsJson = yield* generationValue('migrations', () =>
      generateMigrationsJson(deprecated, allPlugins, [
        categorized.generic,
        categorized.vencordOnly,
        categorized.equicordOnly,
      ])
    );
    const migrationsPath = resolve(pluginsDir, CLI_CONFIG.filenames.migrations);
    yield* generationStep('migrations', () => fse.writeFile(migrationsPath, migrationsJson));
  });
}
