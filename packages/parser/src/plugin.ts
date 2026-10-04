import type { StaticEvaluator } from '@nixcord/ast';
import type {
  ParseDiagnostic,
  PluginConfig,
  PluginRename,
  PluginSetting,
  SettingRename,
} from '@nixcord/shared';
import type { CallExpression, SourceFile } from 'ts-morph';
import {
  diagnostic,
  type PluginContext,
  type PluginParseResult,
  type UnresolvedAstValue,
} from './context.js';
import {
  apiCalls,
  evaluated,
  findDefinePluginCall,
  findSettingsCall,
  objectArgument,
  objectPropertyInitializer,
  settingsBindingsForCall,
} from './resolve.js';
import { isRecord, rawSettingsFromArgument, settingNodeMap } from './settings/extract.js';
import { privateSettings } from './settings/infer.js';
import { normalizeSetting } from './settings/normalize.js';

// Assemble one plugin and its migrations, preserving private-schema precedence
const PLUGIN_DIR_SEPARATOR_PATTERN = /[-_]/;

const inferPluginName = (pluginDir: string, pluginInfoName: string | undefined): string =>
  pluginInfoName ||
  pluginDir
    .split(PLUGIN_DIR_SEPARATOR_PATTERN)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

async function extractSettings(
  settingsCall: CallExpression,
  context: PluginContext,
  pluginName: string
): Promise<Record<string, PluginSetting | PluginConfig>> {
  const privateDefinitions = privateSettings(settingsCall, context);
  const argument = settingsCall.getArguments()[0];
  if (!argument) return privateDefinitions;
  const unresolved: UnresolvedAstValue[] = [];
  const directSettings = rawSettingsFromArgument(
    argument,
    context.session.checker,
    context.evaluator,
    unresolved
  );
  for (const item of unresolved) {
    context.diagnostics.push(
      diagnostic('unresolved-setting-expression', 'warning', 'evaluation', item.reason, {
        pluginName,
        ...(item.path ? { settingPath: item.path } : {}),
        node: item.node,
      })
    );
  }
  const result = directSettings ? undefined : context.evaluator.evaluate(argument);
  const rawSettings =
    directSettings ?? (result?.known && isRecord(result.value) ? result.value : undefined);
  if (!rawSettings) {
    context.diagnostics.push(
      diagnostic(
        'unsupported-settings-expression',
        'warning',
        'evaluation',
        result?.known
          ? 'Settings expression did not evaluate to an object'
          : (result?.reason ?? 'Settings expression is unresolved'),
        {
          pluginName,
          node: argument,
          evidence: result?.evidence.map(
            (item) => `${item.file}:${item.line}:${item.column} ${item.kind}`
          ),
        }
      )
    );
    return privateDefinitions;
  }
  const nodeMap = settingNodeMap(argument, context.session.checker, context.evaluator);
  const settingsBindings = settingsBindingsForCall(settingsCall);
  // Private schemas take precedence, so avoid executing components whose results would be discarded
  const entries = await Promise.all(
    Object.keys(rawSettings)
      .filter((key) => !Object.hasOwn(privateDefinitions, key))
      .map(async (key) => {
        try {
          const value = rawSettings[key];
          if (!isRecord(value)) return [key, undefined] as const;
          const normalized = await normalizeSetting(
            key,
            value,
            nodeMap.get(key),
            context,
            pluginName,
            key,
            settingsBindings
          );
          return [normalized?.name ?? key, normalized] as const;
        } catch (error) {
          context.diagnostics.push(
            diagnostic(
              'setting-analysis-failed',
              'warning',
              'normalization',
              error instanceof Error ? error.message : String(error),
              {
                pluginName,
                settingPath: key,
                ...(nodeMap.get(key) ? { node: nodeMap.get(key) } : {}),
              }
            )
          );
          return [key, undefined] as const;
        }
      })
  );
  return {
    ...Object.fromEntries(
      entries.filter(
        (entry): entry is readonly [string, PluginSetting | PluginConfig] => entry[1] !== undefined
      )
    ),
    ...privateDefinitions,
  };
}

const literalStringArgs = (call: CallExpression, evaluator: StaticEvaluator): string[] =>
  call.getArguments().flatMap((argument) => {
    const value = evaluated(argument, evaluator);
    return typeof value === 'string' ? [value] : [];
  });

const extractRenames = (
  sourceFiles: readonly SourceFile[],
  context: PluginContext,
  settings: Readonly<Record<string, PluginSetting | PluginConfig>>
): { settingRenames: SettingRename[]; pluginRenames: PluginRename[] } => {
  const activeSettingNames = new Set<string>();
  const collectActiveSettingNames = (
    currentSettings: Readonly<Record<string, PluginSetting | PluginConfig>>,
    prefix = ''
  ): void => {
    for (const [key, setting] of Object.entries(currentSettings)) {
      const name = prefix ? `${prefix}.${key}` : key;
      activeSettingNames.add(name);
      if ('settings' in setting) collectActiveSettingNames(setting.settings, name);
    }
  };
  collectActiveSettingNames(settings);

  const settingRenames = apiCalls(
    sourceFiles,
    'migratePluginSetting',
    context.profile,
    context.session.checker
  ).flatMap((call) => {
    const [pluginName, firstSetting, secondSetting] = literalStringArgs(call, context.evaluator);
    if (!pluginName || !firstSetting || !secondSetting) return [];

    // Vencord declares (plugin, old, new), while Equicord has also used
    // (plugin, new, old). Shared plugins can contain either convention, so
    // use the parsed current schema to identify the destination setting.
    const firstIsActive = activeSettingNames.has(firstSetting);
    const secondIsActive = activeSettingNames.has(secondSetting);
    const [oldSetting, newSetting] =
      firstIsActive && !secondIsActive
        ? [secondSetting, firstSetting]
        : [firstSetting, secondSetting];
    return [{ pluginName, oldSetting, newSetting }];
  });
  const pluginRenames = apiCalls(
    sourceFiles,
    'migratePluginSettings',
    context.profile,
    context.session.checker
  ).flatMap((call) => {
    const [newName, ...oldNames] = literalStringArgs(call, context.evaluator);
    return newName ? oldNames.map((oldName) => ({ oldName, newName })) : [];
  });
  return { settingRenames, pluginRenames };
};

export async function parseSinglePlugin(
  pluginDir: string,
  pluginPath: string,
  entry: SourceFile,
  sourceFiles: readonly SourceFile[],
  baseContext: Omit<PluginContext, 'pluginDir' | 'pluginPath' | 'sourceFiles' | 'diagnostics'>
): Promise<PluginParseResult> {
  const diagnostics: ParseDiagnostic[] = [];
  const context: PluginContext = {
    ...baseContext,
    pluginDir,
    pluginPath,
    sourceFiles,
    diagnostics,
  };
  try {
    const definePluginCall = findDefinePluginCall(entry, context.profile, context.session.checker);
    if (!definePluginCall) {
      diagnostics.push(
        diagnostic(
          'plugin-definition-missing',
          'error',
          'discovery',
          `Entry ${pluginDir} does not call the canonical definePlugin API`,
          { pluginName: pluginDir, node: entry }
        )
      );
      return { settingRenames: [], pluginRenames: [], diagnostics };
    }
    const pluginObject = objectArgument(definePluginCall);
    const infoName = evaluated(objectPropertyInitializer(pluginObject, 'name'), context.evaluator);
    const description = evaluated(
      objectPropertyInitializer(pluginObject, 'description'),
      context.evaluator
    );
    const isModified = evaluated(
      objectPropertyInitializer(pluginObject, 'isModified'),
      context.evaluator
    );
    const pluginName = inferPluginName(
      pluginDir,
      typeof infoName === 'string' ? infoName : undefined
    );
    const settingsCall = findSettingsCall(
      definePluginCall,
      sourceFiles,
      context.profile,
      context.session.checker
    );
    let settings = settingsCall ? await extractSettings(settingsCall, context, pluginName) : {};
    if (!settingsCall) {
      const inlineOptions = objectPropertyInitializer(pluginObject, 'options');
      if (inlineOptions) {
        const fakeResult = context.evaluator.evaluate(inlineOptions);
        if (fakeResult.known && isRecord(fakeResult.value)) {
          const nodeMap = settingNodeMap(inlineOptions, context.session.checker, context.evaluator);
          const pairs = await Promise.all(
            Object.entries(fakeResult.value).map(
              async ([key, value]) =>
                [
                  key,
                  isRecord(value)
                    ? await normalizeSetting(key, value, nodeMap.get(key), context, pluginName, key)
                    : undefined,
                ] as const
            )
          );
          settings = Object.fromEntries(pairs.filter((pair) => pair[1] !== undefined)) as Record<
            string,
            PluginSetting | PluginConfig
          >;
        }
      }
    }
    const renames = extractRenames(sourceFiles, context, settings);
    return {
      entry: [
        pluginName,
        {
          name: pluginName,
          settings,
          directoryName: pluginDir,
          ...(typeof description === 'string' ? { description } : {}),
          ...(typeof isModified === 'boolean' ? { isModified } : {}),
        },
      ],
      ...renames,
      diagnostics,
    };
  } catch (error) {
    diagnostics.push(
      diagnostic(
        'plugin-analysis-failed',
        'error',
        'evaluation',
        `Failed to parse ${pluginDir}: ${error instanceof Error ? error.message : String(error)}`,
        { pluginName: pluginDir, node: entry }
      )
    );
    return { settingRenames: [], pluginRenames: [], diagnostics };
  }
}
