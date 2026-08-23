import { CLI_CONFIG } from '@nixcord/shared';
import { createFixture } from 'fs-fixture';
import { describe, expect, test } from 'vitest';
import { applyPluginOverrides } from '../src/plugin-overrides.js';

describe('applyPluginOverrides', () => {
  test('deep-merges category overrides into generated plugin JSON', async () => {
    await using fixture = await createFixture({
      'overrides.json': JSON.stringify({
        shared: {
          Demo: {
            settings: {
              list: ['new'],
              nested: { added: 4, right: 3 },
            },
          },
        },
      }),
      plugins: {
        [CLI_CONFIG.filenames.shared]: JSON.stringify({
          Demo: {
            enabled: false,
            settings: {
              list: ['old'],
              nested: { left: 1, right: 2 },
            },
          },
        }),
        [CLI_CONFIG.filenames.vencord]: '{}',
        [CLI_CONFIG.filenames.equicord]: '{"OnlyEquicord":true}',
      },
    });

    await applyPluginOverrides(fixture.getPath('overrides.json'), fixture.getPath('plugins'));

    await expect(fixture.readJson(`plugins/${CLI_CONFIG.filenames.shared}`)).resolves.toEqual({
      Demo: {
        enabled: false,
        settings: {
          list: ['new'],
          nested: { left: 1, right: 3, added: 4 },
        },
      },
    });
    await expect(fixture.readJson(`plugins/${CLI_CONFIG.filenames.equicord}`)).resolves.toEqual({
      OnlyEquicord: true,
    });
  });

  test('applies all overrides to whichever category contains the plugin', async () => {
    await using fixture = await createFixture({
      'overrides.json': JSON.stringify({
        all: {
          MovedPlugin: {
            settings: {
              dynamicDefault: { default: false },
            },
          },
        },
      }),
      plugins: {
        [CLI_CONFIG.filenames.shared]: JSON.stringify({
          MovedPlugin: {
            settings: {
              dynamicDefault: { type: 'types.bool' },
            },
          },
        }),
        [CLI_CONFIG.filenames.vencord]: JSON.stringify({
          MovedPlugin: { settings: {} },
        }),
        [CLI_CONFIG.filenames.equicord]: '{}',
      },
    });

    await applyPluginOverrides(fixture.getPath('overrides.json'), fixture.getPath('plugins'));

    await expect(fixture.readJson(`plugins/${CLI_CONFIG.filenames.shared}`)).resolves.toEqual({
      MovedPlugin: {
        settings: {
          dynamicDefault: { type: 'types.bool', default: false },
        },
      },
    });
    await expect(fixture.readJson(`plugins/${CLI_CONFIG.filenames.vencord}`)).resolves.toEqual({
      MovedPlugin: { settings: {} },
    });
    await expect(fixture.readJson(`plugins/${CLI_CONFIG.filenames.equicord}`)).resolves.toEqual({});
  });

  test('rejects an overrides document that is not an object', async () => {
    await using fixture = await createFixture({
      'overrides.json': '[]',
      plugins: {},
    });

    await expect(
      applyPluginOverrides(fixture.getPath('overrides.json'), fixture.getPath('plugins'))
    ).rejects.toThrow('Plugin overrides must be a JSON object');
  });

  test('rejects non-object category overrides', async () => {
    await using fixture = await createFixture({
      'overrides.json': JSON.stringify({ shared: [] }),
      plugins: {
        [CLI_CONFIG.filenames.shared]: '{}',
      },
    });

    await expect(
      applyPluginOverrides(fixture.getPath('overrides.json'), fixture.getPath('plugins'))
    ).rejects.toThrow('Plugin overrides category must be a JSON object: shared');
  });

  test('rejects a non-object all override', async () => {
    await using fixture = await createFixture({
      'overrides.json': JSON.stringify({ all: [] }),
      plugins: {},
    });

    await expect(
      applyPluginOverrides(fixture.getPath('overrides.json'), fixture.getPath('plugins'))
    ).rejects.toThrow('Plugin overrides category must be a JSON object: all');
  });

  test('keeps prototype-shaped JSON keys as ordinary data', async () => {
    await using fixture = await createFixture({
      'overrides.json': '{"shared":{"__proto__":{"polluted":true}}}',
      plugins: {
        [CLI_CONFIG.filenames.shared]: '{}',
        [CLI_CONFIG.filenames.vencord]: '{}',
        [CLI_CONFIG.filenames.equicord]: '{}',
      },
    });

    await applyPluginOverrides(fixture.getPath('overrides.json'), fixture.getPath('plugins'));

    const output = await fixture.readJson(`plugins/${CLI_CONFIG.filenames.shared}`);
    expect(Object.hasOwn(output, '__proto__')).toBe(true);
    expect(Reflect.get(output, '__proto__')).toEqual({ polluted: true });
    expect(Object.prototype).not.toHaveProperty('polluted');
  });
});
