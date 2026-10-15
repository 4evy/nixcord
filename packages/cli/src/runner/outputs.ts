import type { ParsedPluginsResult } from '@nixcord/domain';
import {
  generateParseRulesModule,
  type PluginCategory,
  type PluginJson,
} from '@nixcord/nix-generator';
import { CLI_CONFIG } from '@nixcord/shared';
import fse from 'fs-extra';
import { dirname, join, normalize, resolve } from 'pathe';
import type { GeneratePluginOptionsSummary } from './params.js';
import { compilePluginOptions, compilePluginPaths } from './schema.js';

export type CategorySchemas = Record<PluginCategory, Record<string, PluginJson>>;

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
    compilePluginOptions([schemas.shared, schemas.vencord, schemas.equicord])
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
