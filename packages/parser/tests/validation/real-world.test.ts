import { existsSync } from 'node:fs';
import {
  CLI_CONFIG,
  type ParsedPluginsResult,
  ParsedPluginsResultSchema,
  type PluginSetting,
} from '@nixcord/shared';
import { beforeAll, describe, expect, test } from 'vitest';
import { categorizePlugins, parsePlugins } from '../../src/index.js';

const VENCORD_PATH = CLI_CONFIG.sources.vencord;
const EQUICORD_PATH = CLI_CONFIG.sources.equicord;

let vencordPromise: Promise<ParsedPluginsResult> | undefined;
let equicordPromise: Promise<ParsedPluginsResult> | undefined;
const parseVencord = () => (vencordPromise ??= parsePlugins(VENCORD_PATH));
const parseEquicord = () => (equicordPromise ??= parsePlugins(EQUICORD_PATH));

describe.skipIf(!existsSync(VENCORD_PATH))('pinned Vencord source', () => {
  let result: ParsedPluginsResult;

  beforeAll(async () => {
    result = await parseVencord();
  }, 60_000);

  test('parses the complete plugin tree into the public result schema', () => {
    expect(ParsedPluginsResultSchema.safeParse(result).success).toBe(true);
    expect(Object.keys(result.vencordPlugins).length).toBeGreaterThan(150);
  });

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
      type: 'types.enum',
      default: 'Greet',
      enumValues: ['Greet', 'Message'],
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
      type: 'types.enum',
      default: 'always',
      enumValues: ['always', 'unclaimed', 'never'],
    });
    expect((questify?.settings.questButtonBadgeColor as PluginSetting).default).toBe(2842239);
    expect((questify?.settings.questOrder as PluginSetting).default).toEqual([
      'UNCLAIMED',
      'CLAIMED',
      'IGNORED',
      'EXPIRED',
    ]);
  });
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
    }, 120_000);
  }
);
