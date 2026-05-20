import { describe, test, expect } from 'vitest';
import { generateMigrationsData, generateMigrationsJson } from '../src/migrations-generator.js';
import type { ReadonlyDeep, PluginConfig, DeprecatedData } from '@nixcord/shared';

const mkPlugin = (description = ''): ReadonlyDeep<PluginConfig> => ({
  name: 'TestPlugin',
  description,
  settings: {},
  source: 'vencord' as const,
});

describe('generateMigrationsData()', () => {
  test('emits removal names for the Nix adapter', () => {
    const deprecated: DeprecatedData = {
      renames: {},
      removals: {
        absRPC: { date: '2024-01-01' },
        betterArea: { date: '2024-01-01' },
      },
      settingRenames: {},
    };
    const allPlugins: Record<string, ReadonlyDeep<PluginConfig>> = {
      testPlugin: mkPlugin('A test plugin'),
    };

    const result = generateMigrationsData(deprecated, allPlugins);

    expect(result.removals).toEqual(['absRPC', 'betterArea']);
    expect(result.renames).toEqual([]);
  });

  test('empty migrations produce empty JSON arrays', () => {
    const deprecated: DeprecatedData = {
      renames: {},
      removals: {},
      settingRenames: {},
    };
    const allPlugins: Record<string, ReadonlyDeep<PluginConfig>> = {};

    const result = generateMigrationsData(deprecated, allPlugins);

    expect(result).toEqual({ renames: [], removals: [] });
  });

  test('setting rename aliases are warning migrations', () => {
    const deprecated: DeprecatedData = {
      renames: {},
      removals: {},
      settingRenames: {
        testPlugin: { oldSetting: 'newSetting' },
      },
    };
    const allPlugins: Record<string, ReadonlyDeep<PluginConfig>> = {
      testPlugin: mkPlugin('test'),
    };

    const result = generateMigrationsData(deprecated, allPlugins);

    expect(result).toEqual({
      renames: [
        {
          from: ['testPlugin', 'oldSetting'],
          to: ['testPlugin', 'newSetting'],
          warn: true,
        },
      ],
      removals: [],
    });
  });

  test('plugin rename aliases are silent for target defaults', () => {
    const deprecated: DeprecatedData = {
      renames: { OldPlugin: { to: 'NewPlugin', date: '2026-01-01' } },
      removals: {},
      settingRenames: {},
    };
    const allPlugins: Record<string, ReadonlyDeep<PluginConfig>> = {
      NewPlugin: {
        ...mkPlugin('new'),
        settings: {
          format: {
            name: 'format',
            type: 'types.str',
            description: '',
            default: 'compact',
          },
        },
      },
    };

    const result = generateMigrationsData(deprecated, allPlugins);

    expect(result.renames).toEqual([
      {
        from: ['oldPlugin', 'enable'],
        to: ['newPlugin', 'enable'],
        warn: false,
      },
      {
        from: ['oldPlugin', 'format'],
        to: ['newPlugin', 'format'],
        warn: false,
      },
    ]);
  });

  test('can emit renames and removals together', () => {
    const deprecated: DeprecatedData = {
      renames: {},
      removals: {
        deadPlugin: { date: '2024-01-01' },
      },
      settingRenames: {
        testPlugin: { oldSetting: 'newSetting' },
      },
    };
    const allPlugins: Record<string, ReadonlyDeep<PluginConfig>> = {
      testPlugin: mkPlugin('test'),
    };

    const result = generateMigrationsData(deprecated, allPlugins);

    expect(result).toEqual({
      renames: [
        {
          from: ['testPlugin', 'oldSetting'],
          to: ['testPlugin', 'newSetting'],
          warn: true,
        },
      ],
      removals: ['deadPlugin'],
    });
  });

  test('skips removal shims for plugins that are still active', () => {
    const deprecated: DeprecatedData = {
      renames: {},
      removals: {
        testPlugin: { date: '2024-01-01' },
      },
      settingRenames: {},
    };
    const allPlugins: Record<string, ReadonlyDeep<PluginConfig>> = {
      testPlugin: mkPlugin('still active'),
    };

    const result = generateMigrationsData(deprecated, allPlugins);

    expect(result.removals).toEqual([]);
    expect(result.renames).toEqual([]);
  });

  test('serializes formatted JSON', () => {
    const deprecated: DeprecatedData = {
      renames: {},
      removals: {
        deadPlugin: { date: '2024-01-01' },
      },
      settingRenames: {},
    };
    const allPlugins: Record<string, ReadonlyDeep<PluginConfig>> = {};

    const result = generateMigrationsJson(deprecated, allPlugins);

    expect(result).toBe('{\n  "renames": [],\n  "removals": [\n    "deadPlugin"\n  ]\n}');
  });
});
