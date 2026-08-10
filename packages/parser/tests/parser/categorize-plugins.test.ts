import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ParsedPluginsResult, PluginSetting } from '@nixcord/shared';
import { describe, expect, test } from 'vitest';
import { categorizePlugins, parsePlugins } from '../../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_ROOT = join(__dirname, '..', 'fixtures');
const VENCORD_FIXTURE = join(FIXTURES_ROOT, 'vencord');
const EQUICORD_FIXTURE = join(FIXTURES_ROOT, 'equicord');

describe('categorizePlugins()', () => {
  test('categorizes generic (shared) plugins', () => {
    const vencordResult: ParsedPluginsResult = {
      vencordPlugins: {
        'Shared Plugin': {
          name: 'Shared Plugin',
          settings: {},
        },
      },
      equicordPlugins: {},
    };

    const equicordResult: ParsedPluginsResult = {
      vencordPlugins: {
        'Shared Plugin': {
          name: 'Shared Plugin',
          settings: {},
        },
      },
      equicordPlugins: {},
    };

    const result = categorizePlugins(vencordResult, equicordResult);
    const sharedPlugin = result.generic['Shared Plugin'];

    if (!sharedPlugin) {
      throw new Error('Expected Shared Plugin to be categorized as generic');
    }
    expect(sharedPlugin.name).toBe('Shared Plugin');
    expect(result.vencordOnly['Shared Plugin']).toBeUndefined();
  });

  test('categorizes vencord-only plugins', () => {
    const vencordResult: ParsedPluginsResult = {
      vencordPlugins: {
        'Vencord Only': {
          name: 'Vencord Only',
          settings: {},
        },
      },
      equicordPlugins: {},
    };

    const equicordResult: ParsedPluginsResult = {
      vencordPlugins: {},
      equicordPlugins: {},
    };

    const result = categorizePlugins(vencordResult, equicordResult);
    expect(result.vencordOnly['Vencord Only']).toBeDefined();
    expect(result.generic['Vencord Only']).toBeUndefined();
  });

  test('categorizes equicord-only plugins', () => {
    const vencordResult: ParsedPluginsResult = {
      vencordPlugins: {},
      equicordPlugins: {},
    };

    const equicordResult: ParsedPluginsResult = {
      vencordPlugins: {},
      equicordPlugins: {
        'Equicord Only': {
          name: 'Equicord Only',
          settings: {},
        },
      },
    };

    const result = categorizePlugins(vencordResult, equicordResult);
    expect(result.equicordOnly['Equicord Only']).toBeDefined();
    expect(result.generic['Equicord Only']).toBeUndefined();
  });

  test('handles missing equicordResult', () => {
    const vencordResult: ParsedPluginsResult = {
      vencordPlugins: {
        'Vencord Plugin': {
          name: 'Vencord Plugin',
          settings: {},
        },
      },
      equicordPlugins: {},
    };

    const result = categorizePlugins(vencordResult);
    expect(result.vencordOnly['Vencord Plugin']).toBeDefined();
    expect(result.equicordOnly).toEqual({});
  });

  test('categorizes plugins that live only in Equicord src/plugins as equicord-only', () => {
    const vencordResult: ParsedPluginsResult = {
      vencordPlugins: {},
      equicordPlugins: {},
    };

    const equicordResult: ParsedPluginsResult = {
      vencordPlugins: {
        EquicordExtra: {
          name: 'EquicordExtra',
          description: 'Only shipped from Equicord src/plugins',
          settings: {},
          directoryName: 'equicordExtra',
        },
      },
      equicordPlugins: {},
    };

    const result = categorizePlugins(vencordResult, equicordResult);
    expect(result.equicordOnly.EquicordExtra).toBeDefined();
    expect(result.generic.EquicordExtra).toBeUndefined();
    expect(result.vencordOnly.EquicordExtra).toBeUndefined();
  });

  test('categorizes CharacterCounter as shared when both clients ship it', () => {
    const characterCounter = {
      name: 'CharacterCounter',
      description: 'Adds a character counter to the chat input',
      settings: {
        colorEffects: {
          name: 'colorEffects',
          type: 'types.bool',
          default: true,
        },
      },
      directoryName: 'characterCounter',
    };

    const vencordResult: ParsedPluginsResult = {
      vencordPlugins: {
        CharacterCounter: characterCounter,
      },
      equicordPlugins: {},
    };

    const equicordResult: ParsedPluginsResult = {
      vencordPlugins: {
        CharacterCounter: characterCounter,
      },
      equicordPlugins: {},
    };

    const result = categorizePlugins(vencordResult, equicordResult);
    expect(result.generic.CharacterCounter).toBeDefined();
    expect(result.vencordOnly.CharacterCounter).toBeUndefined();
    expect(result.equicordOnly.CharacterCounter).toBeUndefined();
  });

  test('keeps renamed equicord-only plugin targets when the old Vencord plugin still exists', () => {
    const vencordResult: ParsedPluginsResult = {
      vencordPlugins: {
        oneko: {
          name: 'oneko',
          description: 'cat follow mouse',
          settings: {},
          directoryName: 'oneko',
        },
      },
      equicordPlugins: {},
    };

    const equicordResult: ParsedPluginsResult = {
      vencordPlugins: {},
      equicordPlugins: {
        CursorBuddy: {
          name: 'CursorBuddy',
          description: 'Pick a cursor buddy',
          settings: {
            buddy: {
              name: 'buddy',
              type: 'types.enum',
              default: 'oneko',
            },
          },
          directoryName: 'cursorBuddy',
          isModified: true,
        },
      },
    };

    const result = categorizePlugins(vencordResult, equicordResult);
    expect(result.vencordOnly.oneko).toBeDefined();
    expect(result.equicordOnly.CursorBuddy).toBeDefined();
  });

  test('splits same-name plugins when their setting keys differ', () => {
    const vencordResult: ParsedPluginsResult = {
      vencordPlugins: {
        FakeNitro: {
          name: 'FakeNitro',
          settings: {
            useHyperLinks: {
              name: 'useHyperLinks',
              type: 'types.bool',
              default: true,
            },
          },
        },
      },
      equicordPlugins: {},
    };

    const equicordResult: ParsedPluginsResult = {
      vencordPlugins: {
        FakeNitro: {
          name: 'FakeNitro',
          settings: {
            useStickerHyperLinks: {
              name: 'useStickerHyperLinks',
              type: 'types.bool',
              default: true,
            },
            useEmojiHyperLinks: {
              name: 'useEmojiHyperLinks',
              type: 'types.bool',
              default: true,
            },
          },
        },
      },
      equicordPlugins: {},
    };

    const result = categorizePlugins(vencordResult, equicordResult);
    expect(result.generic.FakeNitro).toBeUndefined();
    expect(result.vencordOnly.FakeNitro).toBeDefined();
    expect(result.equicordOnly.FakeNitro).toBeDefined();
  });

  test('splits same-name plugins when a setting has incompatible client types', () => {
    const vencordResult: ParsedPluginsResult = {
      vencordPlugins: {
        SilentMessageToggle: {
          name: 'SilentMessageToggle',
          settings: {
            persistState: {
              name: 'persistState',
              type: { kind: 'boolean' },
              default: false,
            },
          },
        },
      },
      equicordPlugins: {},
      settingRenames: [],
      pluginRenames: [],
      diagnostics: [],
    };

    const equicordResult: ParsedPluginsResult = {
      vencordPlugins: {
        SilentMessageToggle: {
          name: 'SilentMessageToggle',
          settings: {
            persistState: {
              name: 'persistState',
              type: { kind: 'enum', values: ['none', 'channels', 'restarts'] },
              default: 'none',
            },
          },
        },
      },
      equicordPlugins: {},
      settingRenames: [],
      pluginRenames: [],
      diagnostics: [],
    };

    const result = categorizePlugins(vencordResult, equicordResult);
    expect(result.generic.SilentMessageToggle).toBeUndefined();
    expect(result.vencordOnly.SilentMessageToggle?.settings.persistState).toMatchObject({
      type: { kind: 'boolean' },
      default: false,
    });
    expect(result.equicordOnly.SilentMessageToggle?.settings.persistState).toMatchObject({
      type: { kind: 'enum', values: ['none', 'channels', 'restarts'] },
      default: 'none',
    });
  });

  test('uses equicord config for shared plugins', () => {
    const vencordResult: ParsedPluginsResult = {
      vencordPlugins: {
        'Shared Plugin': {
          name: 'Shared Plugin',
          description: 'Vencord description',
          settings: {
            setting: {
              name: 'setting',
              type: 'types.str',
              default: 'vencord-value',
            },
          },
        },
      },
      equicordPlugins: {},
    };

    const equicordResult: ParsedPluginsResult = {
      vencordPlugins: {
        'Shared Plugin': {
          name: 'Shared Plugin',
          description: 'Equicord description',
          settings: {
            setting: {
              name: 'setting',
              type: 'types.str',
              default: 'equicord-value',
            },
          },
        },
      },
      equicordPlugins: {},
    };

    const result = categorizePlugins(vencordResult, equicordResult);

    const shared = result.generic['Shared Plugin'];
    if (
      shared === undefined ||
      shared.description !== 'Equicord description' ||
      (shared.settings.setting as PluginSetting).default !== 'equicord-value'
    ) {
      throw new Error('Shared Plugin should prefer the Equicord definition');
    }
    expect(shared.name).toBe('Shared Plugin');
  });
});

describe('parsePlugins() fixture integration', () => {
  test('categorizePlugins prefers Equicord definitions when both repos present', async () => {
    const vencordResult = await parsePlugins(VENCORD_FIXTURE);
    const equicordResult = await parsePlugins(EQUICORD_FIXTURE);

    const categorized = categorizePlugins(vencordResult, equicordResult);
    expect(categorized.generic['Shared Plugin']).toBeDefined();
    expect(categorized.generic['Shared Plugin']!.description).toBe('Equicord shared description');

    expect(categorized.vencordOnly['Vencord Only']).toBeDefined();
    expect(categorized.equicordOnly['Equicord Only']).toBeDefined();
  });
});
