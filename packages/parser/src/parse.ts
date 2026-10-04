import { type AnalysisSession, createAnalysisSession, StaticEvaluator } from '@nixcord/ast';
import {
  CLI_CONFIG,
  type ParseDiagnostic,
  type ParsedPluginsResult,
  type PluginConfig,
  type PluginRename,
  type SettingRename,
} from '@nixcord/shared';
import fg from 'fast-glob';
import fse from 'fs-extra';
import pLimit from 'p-limit';
import { basename, dirname, join, normalize, relative, resolve } from 'pathe';
import * as z from 'zod';
import type { PluginParseResult } from './context.js';
import { parseSinglePlugin } from './plugin.js';
import { SOURCE_PROFILES, type SourceProfile } from './profiles.js';

// Own directory discovery, shared sessions, and deterministic plugin traversal
const PROGRESS_REPORT_INTERVAL = 25;
const EXECUTION_CONCURRENCY = 4;

const ParsePluginsOptionsSchema = z.object({
  vencordPluginsDir: z.string().min(1).optional(),
  equicordPluginsDir: z.string().min(1).optional(),
  executionMode: z.enum(['disabled', 'fallback']).optional(),
});

export interface ParsePluginsOptions {
  readonly vencordPluginsDir?: string;
  readonly equicordPluginsDir?: string;
  readonly executionMode?: 'disabled' | 'fallback';
}

interface DirectoryParseResult {
  readonly plugins: Readonly<Record<string, PluginConfig>>;
  readonly settingRenames: SettingRename[];
  readonly pluginRenames: PluginRename[];
  readonly diagnostics: ParseDiagnostic[];
}

const emptyDirectoryResult = (): DirectoryParseResult => ({
  plugins: {} as Readonly<Record<string, PluginConfig>>,
  settingRenames: [],
  pluginRenames: [],
  diagnostics: [],
});

async function parsePluginsFromDirectory(
  pluginsPath: string,
  profile: SourceProfile,
  session: AnalysisSession,
  executionMode: 'disabled' | 'fallback'
): Promise<DirectoryParseResult> {
  const entryFiles = await fg([...profile.entryGlobs], {
    cwd: pluginsPath,
    absolute: true,
    onlyFiles: true,
  });
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
  if (!process.stdout.isTTY)
    console.log(`Found ${entries.length} plugin entries in ${basename(pluginsPath)}`);

  const executionLimit = pLimit(EXECUTION_CONCURRENCY);
  const evaluator = new StaticEvaluator(session.checker, {
    constants: Object.fromEntries(
      Object.entries(profile.enumMemberFallbacks).flatMap(([enumName, members]) =>
        Object.entries(members).map(([memberName, value]) => [`${enumName}.${memberName}`, value])
      )
    ),
  });
  const results: PluginParseResult[] = [];
  for (let index = 0; index < entries.length; index++) {
    const { file, pluginDir, sourceRoot, isDirectoryEntry } = entries[index];
    const entry = session.getSourceFile(file);
    if (!entry) continue;
    const pluginFiles = isDirectoryEntry
      ? session.sourceFiles.filter((sourceFile) =>
          sourceFile.getFilePath().startsWith(`${sourceRoot}/`)
        )
      : [entry];
    results.push(
      await parseSinglePlugin(pluginDir, sourceRoot, entry, pluginFiles, {
        profile,
        session,
        evaluator,
        executionMode,
        executionLimit,
      })
    );
    if (!process.stdout.isTTY && (index + 1) % PROGRESS_REPORT_INTERVAL === 0)
      console.log(`Processed ${index + 1}/${entries.length} plugins...`);
  }

  return {
    plugins: Object.fromEntries(
      results.flatMap((result) => (result.entry ? [result.entry] : []))
    ) as Readonly<Record<string, PluginConfig>>,
    settingRenames: results.flatMap((result) => result.settingRenames),
    pluginRenames: results.flatMap((result) => result.pluginRenames),
    diagnostics: results.flatMap((result) => result.diagnostics),
  };
}

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

export async function parsePlugins(
  sourcePath: string,
  options: ParsePluginsOptions = {}
): Promise<ParsedPluginsResult> {
  sourcePath = resolve(sourcePath);
  const validated = ParsePluginsOptionsSchema.parse(options);
  const vencordPluginsDir = validated.vencordPluginsDir ?? CLI_CONFIG.directories.vencordPlugins;
  const equicordPluginsDir = validated.equicordPluginsDir ?? CLI_CONFIG.directories.equicordPlugins;
  const pluginsPath = normalize(join(sourcePath, vencordPluginsDir));
  const equicordPluginsPath = normalize(join(sourcePath, equicordPluginsDir));
  const [hasVencord, hasEquicord] = await Promise.all([
    fse.pathExists(pluginsPath),
    fse.pathExists(equicordPluginsPath),
  ]);
  if (!hasVencord && !hasEquicord) {
    throw new Error(
      `No plugins directories found. Expected one of:\n  - ${pluginsPath}\n  - ${equicordPluginsPath}`
    );
  }

  const filePaths = await sourceFilesForAnalysis(
    sourcePath,
    [hasVencord ? vencordPluginsDir : '', hasEquicord ? equicordPluginsDir : ''].filter(Boolean)
  );
  const session = await createAnalysisSession({
    rootPath: sourcePath,
    filePaths,
    tsConfigPath: normalize(join(sourcePath, 'tsconfig.json')),
  });
  const executionMode = validated.executionMode ?? 'fallback';
  const vencordResult = hasVencord
    ? await parsePluginsFromDirectory(pluginsPath, SOURCE_PROFILES.vencord, session, executionMode)
    : emptyDirectoryResult();
  const equicordResult = hasEquicord
    ? await parsePluginsFromDirectory(
        equicordPluginsPath,
        SOURCE_PROFILES.equicord,
        session,
        executionMode
      )
    : emptyDirectoryResult();

  return {
    vencordPlugins: vencordResult.plugins,
    equicordPlugins: equicordResult.plugins,
    settingRenames: [...vencordResult.settingRenames, ...equicordResult.settingRenames],
    pluginRenames: [...vencordResult.pluginRenames, ...equicordResult.pluginRenames],
    diagnostics: [...vencordResult.diagnostics, ...equicordResult.diagnostics],
  };
}
