import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PluginSetting } from '@nixcord/shared';
import { createFixture } from 'fs-fixture';
import { describe, expect, test } from 'vitest';
import { parsePlugins } from '../../src/index.js';

const FIXTURE_REPOSITORY = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'vencord'
);

describe('parsePlugins()', () => {
  test('parses a representative Vencord repository fixture', async () => {
    await using fixture = await createFixture(FIXTURE_REPOSITORY);

    const result = await parsePlugins(fixture.path);
    const plugins = result.vencordPlugins;

    expect(Object.keys(plugins)).toEqual(
      expect.arrayContaining([
        'Shared Plugin',
        'Vencord Only',
        'CustomRPC',
        'RenamedPlugin',
        'MixedDiagnostics',
        'NestedSettings',
        'NoNamePlugin',
        'No Settings',
        'DiscordEnum',
      ])
    );

    expect(plugins['Shared Plugin']?.settings).toMatchObject({
      mode: { type: 'types.enum', default: 'default', enumValues: ['default', 'alt'] },
      message: { type: 'types.str', default: 'vencord' },
    });
    expect((plugins.NestedSettings?.settings.enabled as PluginSetting).default).toBe(true);
    expect((plugins.NoNamePlugin?.settings.message as PluginSetting).default).toBe('hello');
    expect(plugins['No Settings']?.settings).toEqual({});

    expect(plugins.DiscordEnum?.settings.activity).toMatchObject({
      type: 'types.enum',
      default: 1,
      enumValues: [0, 1, 2],
    });
    expect(plugins.CustomRPC?.settings.config).toBeUndefined();
    expect(plugins.CustomRPC?.settings.appID).toMatchObject({
      type: 'types.nullOr types.str',
      default: null,
    });
    expect(plugins.CustomRPC?.settings.type).toMatchObject({
      type: 'types.enum',
      enumValues: [0, 1, 2, 3, 4, 5, 6],
    });

    expect(result.pluginRenames).toEqual(
      expect.arrayContaining([
        { oldName: 'OldPlugin', newName: 'RenamedPlugin' },
        { oldName: 'OlderPlugin', newName: 'RenamedPlugin' },
      ])
    );
    expect(result.settingRenames).toEqual(
      expect.arrayContaining([
        { pluginName: 'RenamedPlugin', oldSetting: 'oldName', newSetting: 'newName' },
        { pluginName: 'RenamedPlugin', oldSetting: 'oldNested', newSetting: 'newNested' },
      ])
    );

    expect((plugins.MixedDiagnostics?.settings.enabled as PluginSetting).default).toBe(true);
    expect(plugins.MixedDiagnostics?.settings.preview).toBeUndefined();
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pluginName: 'MixedDiagnostics',
          kind: 'component-only-setting-skipped',
          message: expect.stringContaining('setting "preview"'),
        }),
      ])
    );
  });

  test('rejects roots without either supported plugin directory', async () => {
    await using fixture = await createFixture();

    await expect(parsePlugins(fixture.path)).rejects.toThrow('No plugins directories found');
  });

  test('returns an empty result for an empty supported plugin directory', async () => {
    await using fixture = await createFixture({ 'src/plugins': {} });

    await expect(parsePlugins(fixture.path)).resolves.toMatchObject({
      vencordPlugins: {},
      equicordPlugins: {},
      diagnostics: [],
      settingRenames: [],
      pluginRenames: [],
    });
  });
});
