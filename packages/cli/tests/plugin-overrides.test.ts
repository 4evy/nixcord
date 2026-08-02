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

  test('rejects an overrides document that is not an object', async () => {
    await using fixture = await createFixture({
      'overrides.json': '[]',
      plugins: {},
    });

    await expect(
      applyPluginOverrides(fixture.getPath('overrides.json'), fixture.getPath('plugins'))
    ).rejects.toThrow('Plugin overrides must be a JSON object');
  });
});
