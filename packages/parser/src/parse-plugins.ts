import {
  extractPluginInfo,
  extractSettingsFromCall,
  extractSettingsFromObject,
  findDefinePluginCall,
  findDefinePluginSettings,
  findMigratePluginSettingCalls,
  findMigratePluginSettingsCalls,
  getPropertyInitializer,
  isBareComponentSetting,
} from '@nixcord/ast';
import type {
  ParseDiagnostic,
  ParsedPluginsResult,
  PluginConfig,
  PluginRename,
  PluginSetting,
  ReadonlyDeep,
  SetOptional,
  SettingRename,
} from '@nixcord/shared';
import { CLI_CONFIG } from '@nixcord/shared';
import fg from 'fast-glob';
import fse from 'fs-extra';
import pLimit from 'p-limit';
import { basename, dirname, join, normalize } from 'pathe';
import { type ObjectLiteralExpression, type Project, type SourceFile, SyntaxKind } from 'ts-morph';
import { z } from 'zod';
import { createProject } from './project.js';

const PLUGIN_SOURCE_FILE_PATTERNS = ['index.tsx', 'index.ts', 'settings.ts'] as const;
const SERIAL_PROJECT_MUTATION_LIMIT = 1;
const PROGRESS_REPORT_INTERVAL = 10;
const PLUGIN_DIR_SEPARATOR_PATTERN = /[-_]/;
const PLUGIN_FILE_GLOB_PATTERN = '*/index.{ts,tsx}';
const PLUGIN_SOURCE_GLOB_PATTERN = '**/*.{ts,tsx}';
const CURRENT_DIRECTORY = '.';
const OPTION_TYPE_CUSTOM_TEXT = 'OptionType.CUSTOM';

const ParsePluginsOptionsSchema = z.object({
  vencordPluginsDir: z.string().min(1).optional(),
  equicordPluginsDir: z.string().min(1).optional(),
});

async function findPluginSourceFile(pluginPath: string): Promise<string | undefined> {
  for (const pattern of PLUGIN_SOURCE_FILE_PATTERNS) {
    const filePath = normalize(join(pluginPath, pattern));
    if (await fse.pathExists(filePath)) return filePath;
  }
  return undefined;
}

async function findSettingsSourceFile(pluginPath: string): Promise<string | undefined> {
  for (const fileName of ['settings.tsx', 'settings.ts']) {
    const filePath = normalize(join(pluginPath, fileName));
    if (await fse.pathExists(filePath)) return filePath;
  }
  return undefined;
}

interface SinglePluginResult {
  entry: [string, PluginConfig];
  settingRenames: SettingRename[];
  pluginRenames: PluginRename[];
  diagnostics: ParseDiagnostic[];
}

interface PluginSourceFileSession {
  readonly settingsSourceFile?: SourceFile;
  readonly sourceFile: SourceFile;
  readonly allSourceFiles: readonly SourceFile[];
  readonly cleanup: () => void;
}

function classifyEmptySettingsExtraction(
  pluginName: string,
  settingsCall: NonNullable<ReturnType<typeof findDefinePluginSettings>>
): ParseDiagnostic {
  const filePath = settingsCall.getSourceFile().getFilePath();
  const [arg] = settingsCall.getArguments();
  const base = { pluginName, filePath };

  if (!arg) {
    return {
      ...base,
      kind: 'unsupported-settings-argument',
      message: `Found definePluginSettings() for ${pluginName}, but it has no settings argument`,
    };
  }

  const identifier = arg.asKind(SyntaxKind.Identifier);
  if (identifier) {
    const declaration = identifier.getSymbol()?.getValueDeclaration();
    if (!declaration) {
      return {
        ...base,
        kind: 'unresolved-settings-identifier',
        message: `Found definePluginSettings(${identifier.getText()}) for ${pluginName}, but the identifier could not be resolved`,
      };
    }
  }

  const objectLiteral = arg.asKind(SyntaxKind.ObjectLiteralExpression);
  if (objectLiteral) {
    const settingObjects = objectLiteral
      .getProperties()
      .map((prop) => prop.asKind(SyntaxKind.PropertyAssignment)?.getInitializer())
      .map((init) => init?.asKind(SyntaxKind.ObjectLiteralExpression))
      .filter((init): init is ObjectLiteralExpression => init !== undefined);

    if (settingObjects.length > 0 && settingObjects.every(isBareComponentSetting)) {
      return {
        ...base,
        kind: 'component-only-setting-skipped',
        message: `Found definePluginSettings() for ${pluginName}, but all settings are component-only UI settings`,
      };
    }

    if (
      settingObjects.some((setting) => {
        const typeText = getPropertyInitializer(setting, 'type')?.getText();
        return typeText === OPTION_TYPE_CUSTOM_TEXT && !getPropertyInitializer(setting, 'default');
      })
    ) {
      return {
        ...base,
        kind: 'custom-setting-without-default',
        message: `Found definePluginSettings() for ${pluginName}, but custom settings without defaults were skipped`,
      };
    }
  }

  const call = arg.asKind(SyntaxKind.CallExpression);
  if (call) {
    return {
      ...base,
      kind: 'unsupported-generated-settings-pattern',
      message: `Found definePluginSettings() for ${pluginName}, but the generated settings pattern is not supported: ${call.getExpression().getText()}`,
    };
  }

  return {
    ...base,
    kind: 'empty-settings-extraction',
    message: `Found definePluginSettings() for ${pluginName}, but extracted no settings`,
  };
}

async function createPluginSourceFileSession(
  pluginPath: string,
  entryPath: string,
  settingsPath: string | undefined,
  project: Project
): Promise<PluginSourceFileSession> {
  const addedSourceFiles: SourceFile[] = [];
  const getOrAddSourceFile = (filePath: string) => {
    const existing = project.getSourceFile(filePath);
    if (existing) return existing;
    const sourceFile = project.addSourceFileAtPath(filePath);
    addedSourceFiles.push(sourceFile);
    return sourceFile;
  };

  const settingsSourceFile = settingsPath ? getOrAddSourceFile(settingsPath) : undefined;
  const sourceFile = getOrAddSourceFile(entryPath);
  const pluginSourceFiles = await fg(PLUGIN_SOURCE_GLOB_PATTERN, {
    cwd: pluginPath,
    absolute: true,
    onlyFiles: true,
  });
  const allSourceFiles = pluginSourceFiles.map((filePath) =>
    getOrAddSourceFile(normalize(filePath))
  );

  return {
    settingsSourceFile,
    sourceFile,
    allSourceFiles,
    cleanup: () => {
      for (const sourceFile of addedSourceFiles.slice().reverse()) {
        project.removeSourceFile(sourceFile);
      }
    },
  };
}

const uniqueSourceFiles = (sourceFiles: readonly (SourceFile | undefined)[]): SourceFile[] => {
  const seen = new Set<string>();
  return sourceFiles.filter((sourceFile): sourceFile is SourceFile => {
    if (!sourceFile) return false;
    const filePath = sourceFile.getFilePath();
    if (seen.has(filePath)) return false;
    seen.add(filePath);
    return true;
  });
};

const findPluginSettingsCall = (
  session: PluginSourceFileSession
): ReturnType<typeof findDefinePluginSettings> | undefined => {
  for (const sourceFile of uniqueSourceFiles([
    session.settingsSourceFile,
    session.sourceFile,
    ...session.allSourceFiles,
  ])) {
    const settingsCall = findDefinePluginSettings(sourceFile);
    if (settingsCall) return settingsCall;
  }
  return undefined;
};

const inferPluginName = (pluginDir: string, pluginInfoName: string | undefined): string =>
  pluginInfoName ||
  pluginDir
    .split(PLUGIN_DIR_SEPARATOR_PATTERN)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');

const extractInlineDefinePluginOptions = (
  sourceFile: SourceFile,
  project: Project,
  pluginTypeChecker: ReturnType<Project['getTypeChecker']>
): Record<string, PluginSetting | PluginConfig> => {
  const definePluginCallExpr = findDefinePluginCall(sourceFile);
  const pluginObj = definePluginCallExpr
    ?.getArguments()[0]
    ?.asKind(SyntaxKind.ObjectLiteralExpression);
  const optionsInit = pluginObj
    ?.getProperty('options')
    ?.asKind(SyntaxKind.PropertyAssignment)
    ?.getInitializer()
    ?.asKind(SyntaxKind.ObjectLiteralExpression);

  return optionsInit
    ? extractSettingsFromObject(optionsInit, pluginTypeChecker, project.getProgram(), true)
    : {};
};

const extractSettingRenames = (sourceFiles: readonly SourceFile[]): SettingRename[] => {
  const settingRenames: SettingRename[] = [];
  const migrateCalls = sourceFiles.flatMap(findMigratePluginSettingCalls);
  for (const call of migrateCalls) {
    const args = call.getArguments();
    if (args.length >= 3) {
      const callPluginName = args[0].asKind(SyntaxKind.StringLiteral)?.getLiteralValue();
      const oldSetting = args[1].asKind(SyntaxKind.StringLiteral)?.getLiteralValue();
      const newSetting = args[2].asKind(SyntaxKind.StringLiteral)?.getLiteralValue();
      if (callPluginName && newSetting && oldSetting) {
        settingRenames.push({ pluginName: callPluginName, oldSetting, newSetting });
      }
    }
  }
  return settingRenames;
};

const extractPluginRenames = (sourceFiles: readonly SourceFile[]): PluginRename[] => {
  const pluginRenames: PluginRename[] = [];
  const pluginRenameCalls = sourceFiles.flatMap(findMigratePluginSettingsCalls);
  for (const call of pluginRenameCalls) {
    const args = call.getArguments();
    const newName = args[0]?.asKind(SyntaxKind.StringLiteral)?.getLiteralValue();
    if (!newName) continue;
    for (const oldArg of args.slice(1)) {
      const oldName = oldArg.asKind(SyntaxKind.StringLiteral)?.getLiteralValue();
      if (oldName) pluginRenames.push({ oldName, newName });
    }
  }
  return pluginRenames;
};

async function parseSinglePlugin(
  pluginDir: string,
  pluginPath: string,
  project: Project
): Promise<SinglePluginResult | undefined> {
  const path = await findPluginSourceFile(pluginPath);
  if (!path) return undefined;

  const settingsPath = await findSettingsSourceFile(pluginPath);
  const session = await createPluginSourceFileSession(pluginPath, path, settingsPath, project);

  try {
    const pluginTypeChecker = project.getTypeChecker();
    const pluginInfo = extractPluginInfo(session.sourceFile, pluginTypeChecker);
    const pluginName = inferPluginName(pluginDir, pluginInfo.name);

    if (!pluginName) return undefined;

    const settingsCall = findPluginSettingsCall(session);
    let settings: Record<string, PluginSetting | PluginConfig> =
      settingsCall !== undefined
        ? extractSettingsFromCall(settingsCall, pluginTypeChecker, project.getProgram(), true)
        : {};

    if (settingsCall === undefined && Object.keys(settings).length === 0) {
      settings = extractInlineDefinePluginOptions(session.sourceFile, project, pluginTypeChecker);
    }

    const diagnostics =
      settingsCall !== undefined && Object.keys(settings).length === 0
        ? [classifyEmptySettingsExtraction(pluginName, settingsCall)]
        : [];

    const pluginConfig: PluginConfig = {
      name: pluginName,
      settings,
      directoryName: pluginDir,
      ...(pluginInfo.description ? { description: pluginInfo.description } : {}),
      ...(pluginInfo.isModified !== undefined ? { isModified: pluginInfo.isModified } : {}),
    };

    return {
      entry: [pluginName, pluginConfig],
      settingRenames: extractSettingRenames(session.allSourceFiles),
      pluginRenames: extractPluginRenames(session.allSourceFiles),
      diagnostics,
    };
  } finally {
    session.cleanup();
  }
}

interface DirectoryParseResult {
  plugins: ReadonlyDeep<Record<string, PluginConfig>>;
  settingRenames: SettingRename[];
  pluginRenames: PluginRename[];
  diagnostics: ParseDiagnostic[];
}

async function parsePluginsFromDirectory(
  pluginsPath: string,
  project: Project,
  isTTY: boolean
): Promise<DirectoryParseResult> {
  const pluginDirsArray = [
    ...new Set(
      (
        await fg(PLUGIN_FILE_GLOB_PATTERN, { cwd: pluginsPath, absolute: false, onlyFiles: true })
      ).map(dirname)
    ),
  ].filter((dir) => dir !== CURRENT_DIRECTORY);

  if (!isTTY)
    console.log(`Found ${pluginDirsArray.length} plugin directories in ${basename(pluginsPath)}`);

  const limit = pLimit(SERIAL_PROJECT_MUTATION_LIMIT);
  let processed = 0;

  const results = await Promise.all(
    pluginDirsArray.map(async (pluginDir) => {
      const result = await limit(() =>
        parseSinglePlugin(pluginDir, normalize(join(pluginsPath, pluginDir)), project)
      );
      processed++;
      if (!isTTY && processed % PROGRESS_REPORT_INTERVAL === 0) {
        console.log(`Processed ${processed}/${pluginDirsArray.length} plugins...`);
      }
      return result;
    })
  );

  const allSettingRenames: SettingRename[] = [];
  const allPluginRenames: PluginRename[] = [];
  const allDiagnostics: ParseDiagnostic[] = [];
  const pluginEntries: [string, PluginConfig][] = [];

  for (const result of results) {
    if (result) {
      pluginEntries.push(result.entry);
      allSettingRenames.push(...result.settingRenames);
      allPluginRenames.push(...result.pluginRenames);
      allDiagnostics.push(...result.diagnostics);
    }
  }

  return {
    plugins: Object.fromEntries(pluginEntries.filter(([, v]) => v != null)) as ReadonlyDeep<
      Record<string, PluginConfig>
    >,
    settingRenames: allSettingRenames,
    pluginRenames: allPluginRenames,
    diagnostics: allDiagnostics,
  };
}

export type ParsePluginsOptions = SetOptional<
  {
    vencordPluginsDir: string;
    equicordPluginsDir: string;
  },
  'vencordPluginsDir' | 'equicordPluginsDir'
>;

export async function parsePlugins(
  sourcePath: string,
  options: ParsePluginsOptions = {}
): Promise<ParsedPluginsResult> {
  const validatedOptions = ParsePluginsOptionsSchema.parse(options);
  const vencordPluginsDir =
    validatedOptions.vencordPluginsDir ?? CLI_CONFIG.directories.vencordPlugins;
  const equicordPluginsDir =
    validatedOptions.equicordPluginsDir ?? CLI_CONFIG.directories.equicordPlugins;
  const pluginsPath = normalize(join(sourcePath, vencordPluginsDir));
  const equicordPluginsPath = normalize(join(sourcePath, equicordPluginsDir));

  const [hasVencordPlugins, hasEquicordPlugins] = await Promise.all([
    fse.pathExists(pluginsPath),
    fse.pathExists(equicordPluginsPath),
  ]);
  if (!hasVencordPlugins && !hasEquicordPlugins) {
    throw new Error(
      `No plugins directories found. Expected one of:\n  - ${pluginsPath}\n  - ${equicordPluginsPath}`
    );
  }

  const project = await createProject(sourcePath);
  const isTTY = process.stdout.isTTY;

  const parseVencordPlugins = () => parsePluginsFromDirectory(pluginsPath, project, isTTY);
  const parseEquicordPlugins = () => parsePluginsFromDirectory(equicordPluginsPath, project, isTTY);

  const emptyResult: DirectoryParseResult = {
    plugins: {} as ReadonlyDeep<Record<string, PluginConfig>>,
    settingRenames: [],
    pluginRenames: [],
    diagnostics: [],
  };

  const vencordResult = hasVencordPlugins ? await parseVencordPlugins() : emptyResult;
  const equicordResult = hasEquicordPlugins ? await parseEquicordPlugins() : emptyResult;

  return {
    vencordPlugins: vencordResult.plugins,
    equicordPlugins: equicordResult.plugins,
    settingRenames: [...vencordResult.settingRenames, ...equicordResult.settingRenames],
    pluginRenames: [...vencordResult.pluginRenames, ...equicordResult.pluginRenames],
    diagnostics: [...vencordResult.diagnostics, ...equicordResult.diagnostics],
  };
}
