import { existsSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { createAnalysisSession, StaticEvaluator } from '@nixcord/ast';
import {
  CLI_CONFIG,
  type ParsedPluginsResult,
  ParsedPluginsResultSchema,
  type PluginSetting,
} from '@nixcord/shared';
import fg from 'fast-glob';
import { type Node, SyntaxKind, type TypeLiteralNode } from 'ts-morph';
import { beforeAll, describe, expect, test } from 'vitest';
import { categorizePlugins, parsePlugins } from '../../src/index.js';

const VENCORD_PATH = CLI_CONFIG.sources.vencord;
const EQUICORD_PATH = CLI_CONFIG.sources.equicord;

let vencordPromise: Promise<ParsedPluginsResult> | undefined;
let equicordPromise: Promise<ParsedPluginsResult> | undefined;
const parseVencord = () => (vencordPromise ??= parsePlugins(VENCORD_PATH));
const parseEquicord = () => (equicordPromise ??= parsePlugins(EQUICORD_PATH));

const ENTRY_GLOBS = ['*/index.{ts,tsx}', '_core/*.{ts,tsx}'];
const SETTING_OMISSION_DIAGNOSTICS = new Set(['component-ui-only']);

const expectedEntryIds = async (sourceRoot: string, pluginRoot: string): Promise<string[]> =>
  (await fg(ENTRY_GLOBS, { cwd: join(sourceRoot, pluginRoot), onlyFiles: true }))
    .map((entry) => {
      const file = basename(entry);
      return /^index\.(?:ts|tsx)$/.test(file) ? dirname(entry) : entry;
    })
    .sort((left, right) => left.localeCompare(right));

const propertyName = (node: Node, evaluator: StaticEvaluator): string | undefined => {
  if (
    node.isKind(SyntaxKind.Identifier) ||
    node.isKind(SyntaxKind.StringLiteral) ||
    node.isKind(SyntaxKind.NumericLiteral)
  )
    return node.getText().replace(/^['"]|['"]$/g, '');
  const expression = node.asKind(SyntaxKind.ComputedPropertyName)?.getExpression();
  const result = evaluator.evaluate(expression ?? node);
  return result.known && ['string', 'number'].includes(typeof result.value)
    ? String(result.value)
    : undefined;
};

const assertPrivateTypeCoverage = (
  literal: TypeLiteralNode,
  settings: Record<string, unknown>,
  prefix: string,
  missing: string[]
): void => {
  for (const member of literal.getMembers()) {
    const property = member.asKind(SyntaxKind.PropertySignature);
    if (!property) continue;
    const name = property.getName().replace(/^['"]|['"]$/g, '');
    const path = prefix ? `${prefix}.${name}` : name;
    const value = settings[name] as { settings?: Record<string, unknown> } | undefined;
    if (!value) {
      missing.push(path);
      continue;
    }
    const nested = property.getTypeNode()?.asKind(SyntaxKind.TypeLiteral);
    if (nested) assertPrivateTypeCoverage(nested, value.settings ?? {}, path, missing);
  }
};

const auditSettingCoverage = async (
  sourceRoot: string,
  roots: readonly {
    pluginRoot: string;
    plugins: ParsedPluginsResult['vencordPlugins'];
  }[],
  diagnostics: ParsedPluginsResult['diagnostics']
): Promise<string[]> => {
  const pluginRoots = roots.map((root) => root.pluginRoot);
  const filePaths = await fg(
    [
      ...pluginRoots.map((root) => `${root}/**/*.{ts,tsx}`),
      'src/api/Settings.ts',
      'src/utils/types.ts',
      'packages/discord-types/enums/**/*.ts',
    ],
    { cwd: sourceRoot, absolute: true, onlyFiles: true }
  );
  const session = await createAnalysisSession({
    rootPath: sourceRoot,
    filePaths,
    tsConfigPath: join(sourceRoot, 'tsconfig.json'),
  });
  const evaluator = new StaticEvaluator(session.checker);
  const missing: string[] = [];

  for (const sourceFile of session.sourceFiles) {
    const normalized = sourceFile.getFilePath().replaceAll('\\', '/');
    const owner = roots.flatMap((root) => {
      const marker = `/${root.pluginRoot}/`;
      const markerIndex = normalized.indexOf(marker);
      if (markerIndex < 0) return [];
      const entryRelative = normalized.slice(markerIndex + marker.length);
      const parts = entryRelative.split('/');
      if (parts[0]?.startsWith('_') && parts[0] !== '_core') return [];
      const directoryName = parts[0] === '_core' ? `_core/${parts[1] ?? ''}` : (parts[0] ?? '');
      const plugin = Object.values(root.plugins).find(
        (candidate) => candidate.directoryName === directoryName
      );
      return plugin ? [{ plugin, entryRelative }] : [];
    })[0];
    if (!owner) continue;
    if (owner.entryRelative.startsWith('_core/') && owner.entryRelative.split('/').length !== 2)
      continue;

    const hasOmissionDiagnostic = (settingPath: string): boolean =>
      diagnostics.some(
        (item) =>
          item.pluginName === owner.plugin.name &&
          item.settingPath === settingPath &&
          SETTING_OMISSION_DIAGNOSTICS.has(item.code)
      );
    for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expression = call.getExpression();
      const name = expression.isKind(SyntaxKind.Identifier)
        ? expression.getText()
        : expression.isKind(SyntaxKind.PropertyAccessExpression)
          ? expression.getName()
          : undefined;
      if (name === 'definePluginSettings') {
        const argument = call.getArguments()[0];
        if (!argument) continue;
        const keys = new Set<string>();
        const result = evaluator.evaluate(argument);
        if (result.known && result.value && typeof result.value === 'object')
          for (const key of Object.keys(result.value)) keys.add(key);
        const object = argument.asKind(SyntaxKind.ObjectLiteralExpression);
        for (const property of object?.getProperties() ?? []) {
          if (!property.isKind(SyntaxKind.PropertyAssignment)) continue;
          const key = propertyName(property.getNameNode(), evaluator);
          if (key) keys.add(key);
        }
        for (const key of keys)
          if (!(key in owner.plugin.settings) && !hasOmissionDiagnostic(key))
            missing.push(`${owner.plugin.name}.${key}`);
      }

      const property = expression.asKind(SyntaxKind.PropertyAccessExpression);
      if (property?.getName() === 'withPrivateSettings') {
        const literal = call.getTypeArguments()[0]?.asKind(SyntaxKind.TypeLiteral);
        if (literal)
          assertPrivateTypeCoverage(
            literal,
            owner.plugin.settings as Record<string, unknown>,
            owner.plugin.name,
            missing
          );
      }
    }
  }

  return [...new Set(missing)].sort((left, right) => left.localeCompare(right));
};

describe.skipIf(!existsSync(VENCORD_PATH))('pinned Vencord source', () => {
  let result: ParsedPluginsResult;

  beforeAll(async () => {
    result = await parseVencord();
  }, 60_000);

  test('parses the complete plugin tree into the public result schema', () => {
    expect(ParsedPluginsResultSchema.safeParse(result).success).toBe(true);
    expect(Object.keys(result.vencordPlugins).length).toBeGreaterThan(150);
  });

  test('covers every upstream Vencord plugin entry and declared setting', async () => {
    const expectedEntries = await expectedEntryIds(
      VENCORD_PATH,
      CLI_CONFIG.directories.vencordPlugins
    );
    expect(
      Object.values(result.vencordPlugins)
        .map((plugin) => plugin.directoryName)
        .sort((left, right) => (left ?? '').localeCompare(right ?? ''))
    ).toEqual(expectedEntries);
    expect(result.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
    expect(result.diagnostics.filter((item) => item.code.startsWith('execution-'))).toEqual([]);
    expect(
      await auditSettingCoverage(
        VENCORD_PATH,
        [{ pluginRoot: CLI_CONFIG.directories.vencordPlugins, plugins: result.vencordPlugins }],
        result.diagnostics
      )
    ).toEqual([]);
  }, 120_000);

  test('preserves representative upstream settings shapes', () => {
    const plugins = result.vencordPlugins;

    expect((plugins.RelationshipNotifier?.settings.notices as PluginSetting).default).toBe(false);
    expect((plugins.ConsoleJanitor?.settings.allowLevel as PluginSetting).default).toEqual({
      error: true,
      warn: false,
      trace: false,
      log: false,
      info: false,
      debug: false,
    });
    expect((plugins.VcNarrator?.settings.joinMessage as PluginSetting).default).toBe(
      '{{USER}} joined'
    );
    expect(plugins.GreetStickerPicker?.settings.greetMode).toMatchObject({
      type: { kind: 'enum', values: ['Greet', 'Message'] },
      default: 'Greet',
    });
    expect(plugins.NoTrack?.settings.disableAnalytics).toMatchObject({
      type: { kind: 'boolean' },
      default: true,
      restartNeeded: true,
    });
    expect(plugins.Settings?.settings.settingsLocation).toMatchObject({
      type: {
        kind: 'enum',
        values: ['top', 'aboveNitro', 'belowNitro', 'aboveActivity', 'belowActivity', 'bottom'],
      },
      default: 'aboveNitro',
    });
  });
});

describe.skipIf(!existsSync(EQUICORD_PATH))('pinned Equicord source', () => {
  let result: ParsedPluginsResult;

  beforeAll(async () => {
    result = await parseEquicord();
  }, 60_000);

  test('parses both inherited and Equicord-only plugin trees', () => {
    expect(ParsedPluginsResultSchema.safeParse(result).success).toBe(true);
    expect(Object.keys(result.vencordPlugins).length).toBeGreaterThan(150);
    expect(Object.keys(result.equicordPlugins).length).toBeGreaterThan(190);
  });

  test('handles Equicord generated, imported, and nested defaults', () => {
    const questify = result.equicordPlugins.Questify;

    expect(questify?.settings.questButtonDisplay).toMatchObject({
      type: { kind: 'enum', values: ['always', 'unclaimed', 'never'] },
      default: 'always',
    });
    expect((questify?.settings.questButtonBadgeColor as PluginSetting).default).toBe(2842239);
    expect((questify?.settings.questOrder as PluginSetting).default).toEqual([
      'UNCLAIMED',
      'CLAIMED',
      'IGNORED',
      'EXPIRED',
    ]);
    expect(
      (
        result.equicordPlugins.MoreUserTags?.settings.tagSettings as {
          settings: Record<
            string,
            { description?: string; settings: Record<string, PluginSetting> }
          >;
        }
      ).settings.WEBHOOK
    ).toMatchObject({
      description: 'Webhook tag',
      settings: {
        text: { description: 'Text for Webhook tag' },
        showInChat: { description: 'Show Webhook tag in messages' },
        showInNotChat: { description: 'Show Webhook tag in member list and profiles' },
      },
    });
    expect(result.equicordPlugins.CustomFolderIcons?.settings.folderIcons).toMatchObject({
      type: { kind: 'attrs', nullable: false },
      default: {},
      hidden: true,
    });
    expect(result.equicordPlugins.BetterBanReasons?.settings.reasons).toMatchObject({
      type: { kind: 'list', element: 'attrs' },
      default: [],
    });
    expect(result.equicordPlugins.UrlHighlighter?.settings.patterns).toMatchObject({
      type: { kind: 'list', element: 'attrs' },
      default: [],
    });
    expect(result.vencordPlugins.IgnoreActivities?.settings.ignoredActivities).toMatchObject({
      type: { kind: 'list', element: 'attrs' },
      default: [],
    });
    expect(result.equicordPlugins.CommandPalette?.settings.hotkey).toMatchObject({
      type: { kind: 'list', element: 'string' },
    });
    expect(
      (result.equicordPlugins.CommandPalette?.settings.hotkey as PluginSetting).default
    ).toBeUndefined();
    expect(result.equicordPlugins.RandomVoice?.settings.keybind).toMatchObject({
      type: { kind: 'list', element: 'string' },
    });
    expect(
      (result.equicordPlugins.RandomVoice?.settings.keybind as PluginSetting).default
    ).toBeUndefined();
    expect(result.equicordPlugins.MessageLoggerEnhanced?.settings.imageCacheDir).toMatchObject({
      type: { kind: 'string', nullable: true },
      default: null,
    });
    expect(result.equicordPlugins.MessageLoggerEnhanced?.settings.logsDir).toMatchObject({
      type: { kind: 'string', nullable: true },
      default: null,
    });
    expect(result.vencordPlugins.FavoriteEmojiFirst?.settings).not.toHaveProperty('aliases');
    expect(result.vencordPlugins.FavoriteEmojiFirst?.settings).not.toHaveProperty('aliasMap');
    expect(result.equicordPlugins.KeywordNotify?.settings).not.toHaveProperty('keywords');
    expect(result.equicordPlugins.KeywordNotify?.settings).not.toHaveProperty('keywordEntries');
    expect(result.equicordPlugins.RPCEditor?.settings).not.toHaveProperty('replacedAppIds');
    expect(result.equicordPlugins.RPCEditor?.settings).not.toHaveProperty('appIds');
  });

  test('covers every upstream Equicord plugin entry and declared setting', async () => {
    const [expectedVencordEntries, expectedEquicordEntries] = await Promise.all([
      expectedEntryIds(EQUICORD_PATH, CLI_CONFIG.directories.vencordPlugins),
      expectedEntryIds(EQUICORD_PATH, CLI_CONFIG.directories.equicordPlugins),
    ]);
    expect(
      Object.values(result.vencordPlugins)
        .map((plugin) => plugin.directoryName)
        .sort((left, right) => (left ?? '').localeCompare(right ?? ''))
    ).toEqual(expectedVencordEntries);
    expect(
      Object.values(result.equicordPlugins)
        .map((plugin) => plugin.directoryName)
        .sort((left, right) => (left ?? '').localeCompare(right ?? ''))
    ).toEqual(expectedEquicordEntries);
    expect(result.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
    expect(result.diagnostics.filter((item) => item.code.startsWith('execution-'))).toEqual([]);
    expect(
      await auditSettingCoverage(
        EQUICORD_PATH,
        [
          { pluginRoot: CLI_CONFIG.directories.vencordPlugins, plugins: result.vencordPlugins },
          { pluginRoot: CLI_CONFIG.directories.equicordPlugins, plugins: result.equicordPlugins },
        ],
        result.diagnostics
      )
    ).toEqual([]);
  }, 120_000);
});

describe.skipIf(!existsSync(VENCORD_PATH) || !existsSync(EQUICORD_PATH))(
  'pinned upstream categorization',
  () => {
    test('produces shared and client-specific plugin sets from real sources', async () => {
      const [vencord, equicord] = await Promise.all([parseVencord(), parseEquicord()]);
      const categorized = categorizePlugins(vencord, equicord);

      expect(Object.keys(categorized.generic).length).toBeGreaterThan(100);
      expect(Object.keys(categorized.vencordOnly).length).toBeGreaterThan(20);
      expect(Object.keys(categorized.equicordOnly).length).toBeGreaterThan(190);
      expect(categorized.generic.RelationshipNotifier).toBeDefined();
      expect(categorized.equicordOnly.Questify).toBeDefined();
      expect(categorized.generic.Settings).toBeUndefined();
      expect(categorized.vencordOnly.Settings?.settings.settingsLocation).toMatchObject({
        description: 'Where to put the Vencord settings section',
      });
      expect(categorized.equicordOnly.Settings?.settings.settingsLocation).toMatchObject({
        description: 'Where to put the Equicord settings section',
      });
      expect(categorized.generic.SilentMessageToggle).toBeUndefined();
      expect(categorized.vencordOnly.SilentMessageToggle?.settings.persistState).toMatchObject({
        type: { kind: 'boolean' },
        default: false,
      });
      expect(categorized.equicordOnly.SilentMessageToggle?.settings.persistState).toMatchObject({
        type: { kind: 'enum', values: ['none', 'channels', 'restarts'] },
        default: 'none',
      });
    }, 120_000);
  }
);
