import type { ParsedPluginsResult, PluginConfig } from '@nixcord/domain';
import { extractPluginMigrationsEffect } from '@nixcord/git-analyzer';
import {
  generateMigrationsJson,
  toNixIdentifier,
  updateDeprecatedPlugins,
} from '@nixcord/nix-generator';
import type { CategorizedPlugins } from '@nixcord/parser';
import { Effect } from 'effect';
import fse from 'fs-extra';
import { resolve } from 'pathe';
import { CLI_CONFIG } from '../config.js';
import { type GeneratePluginOptionsError, generationStep, generationValue } from './errors.js';
import { getPluginsDir, PLUGIN_CATEGORIES } from './outputs.js';
import type { GeneratePluginOptionsParams } from './params.js';

export function writeMigrations(
  params: GeneratePluginOptionsParams,
  resolvedVencordPath: string,
  resolvedEquicordPath: string | undefined,
  vencordResult: ParsedPluginsResult,
  equicordResult: ParsedPluginsResult | undefined,
  categorized: CategorizedPlugins
): Effect.Effect<void, GeneratePluginOptionsError> {
  return Effect.gen(function* () {
    const verbose = params.verbose ?? false;
    const pluginsDir = getPluginsDir(params.outputPath);

    // Pure generation reuses committed history instead of aging or refreshing it
    const observedHistory = params.skipGitMigrations
      ? undefined
      : yield* Effect.gen(function* () {
          const vencord = yield* extractPluginMigrationsEffect(resolvedVencordPath, [
            params.vencordPluginsDir,
          ]);
          const equicord = resolvedEquicordPath
            ? yield* extractPluginMigrationsEffect(resolvedEquicordPath, [
                params.vencordPluginsDir,
                params.equicordPluginsDir,
              ])
            : { renames: [], deletions: [] };

          const observedAt = new Date().toISOString();
          const sourceRenames = [
            ...(vencordResult.pluginRenames ?? []),
            ...(equicordResult?.pluginRenames ?? []),
          ].map((rename) => ({
            ...rename,
            commitDate: observedAt,
            commitHash: 'source-migration',
          }));

          return {
            renames: [...vencord.renames, ...equicord.renames, ...sourceRenames],
            deletions: [...vencord.deletions, ...equicord.deletions],
            settingRemovals: [
              ...(vencord.settingRemovals ?? []),
              ...(equicord.settingRemovals ?? []),
            ],
          };
        });

    const allSettingRenames = [
      ...(vencordResult.settingRenames ?? []),
      ...(equicordResult?.settingRenames ?? []),
    ];

    const categories = Object.values(PLUGIN_CATEGORIES).map((source) => categorized[source]);
    const allPlugins: Record<string, PluginConfig> = {};
    for (const category of categories) Object.assign(allPlugins, category);

    // Active plugins may appear deleted after a file move; exclude those removals
    const activePluginNames = new Set(Object.keys(allPlugins));

    const deprecated = yield* generationStep('migrations', () =>
      updateDeprecatedPlugins(
        observedHistory,
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
      generateMigrationsJson(deprecated, allPlugins, categories)
    );
    const migrationsPath = resolve(pluginsDir, CLI_CONFIG.filenames.migrations);
    yield* generationStep('migrations', () => fse.writeFile(migrationsPath, migrationsJson));
  });
}
