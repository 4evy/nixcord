import type { ParsedPluginsResult } from '@nixcord/domain';
import {
  generateParseRulesModule,
  type PluginCategory,
  type PluginJson,
} from '@nixcord/nix-generator';
import type { CategorizedPlugins } from '@nixcord/parser';
import { Record as Records } from 'effect';
import fse from 'fs-extra';
import { dirname, join, normalize, resolve } from 'pathe';
import { CLI_CONFIG } from '../config.js';
import type { GeneratePluginOptionsSummary } from './params.js';
import { compilePluginOptions, compilePluginPaths } from './schema.js';

export type CategorySchemas = Record<PluginCategory, Record<string, PluginJson>>;

// Later categories override earlier ones during option and migration generation
export const PLUGIN_CATEGORIES = {
  shared: 'generic',
  vencord: 'vencordOnly',
  equicord: 'equicordOnly',
} as const satisfies Record<PluginCategory, keyof CategorizedPlugins>;

export const getPluginsDir = (outputPath: string): string => {
  return normalize(join(dirname(outputPath), CLI_CONFIG.directories.output));
};

export const writeOutputs = async ({
  generic,
  vencordOnly,
  equicordOnly,
  outputPath,
  schemas,
  metadataPath,
}: {
  generic: ParsedPluginsResult['vencordPlugins'];
  vencordOnly: ParsedPluginsResult['vencordPlugins'];
  equicordOnly: ParsedPluginsResult['vencordPlugins'];
  outputPath: string;
  schemas: CategorySchemas;
  metadataPath?: string;
}): Promise<GeneratePluginOptionsSummary> => {
  const pluginsDir = getPluginsDir(outputPath);
  await fse.ensureDir(pluginsDir);

  await fse.outputFile(resolve(pluginsDir, 'schema/schema.nix'), compilePluginPaths(schemas));
  await fse.outputFile(
    resolve(pluginsDir, 'options/options.nix'),
    compilePluginOptions(
      Object.values(Records.map(PLUGIN_CATEGORIES, (_, category) => schemas[category]))
    )
  );
  if (metadataPath) await fse.outputJson(metadataPath, schemas, { spaces: 2 });

  const parseRulesFilePath = resolve(pluginsDir, CLI_CONFIG.filenames.parseRules);
  await fse.writeFile(
    parseRulesFilePath,
    generateParseRulesModule(generic, vencordOnly, equicordOnly)
  );

  return {
    pluginsDir,
    sharedCount: Object.keys(generic).length,
    vencordOnlyCount: Object.keys(vencordOnly).length,
    equicordOnlyCount: Object.keys(equicordOnly).length,
  };
};
