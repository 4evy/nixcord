import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { convertSettingsJsonToNix } from './converter';

const realEquicordSettingsPath = '/var/home/e0vi/.config/Equicord/settings/settings.json';
const nixInstantiate = '/var/home/e0vi/.local/bin/nix-instantiate';

function expectNixParses(source: string) {
  if (!existsSync(nixInstantiate)) return;

  const dir = mkdtempSync(join(tmpdir(), 'nixcord-converter-'));
  const file = join(dir, 'converted.nix');

  try {
    writeFileSync(file, source);
    execFileSync(nixInstantiate, ['--parse', file], { stdio: 'pipe' });
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
}

describe('convertSettingsJsonToNix', () => {
  test('converts Vencord backup JSON into Nixcord attrs', () => {
    const result = convertSettingsJsonToNix(
      JSON.stringify({
        settings: {
          plugins: {
            AlwaysTrust: {
              domain: false,
              enabled: true,
              file: true,
            },
          },
        },
      })
    );

    expect(result.output).toContain('programs.nixcord.config.plugins = {');
    expect(result.output).not.toContain('programs = {');
    expect(result.output).not.toContain('nixcord = {');
    expect(result.output).toContain('alwaysTrust = {');
    expect(result.output).toContain('enable = true;');
    expect(result.output).toContain('domain = false;');
    expect(result.output).not.toContain('file = true;');
    expect(result.stats).toMatchObject({
      configPluginCount: 1,
      extraPluginCount: 0,
      knownSettingCount: 1,
      pluginCount: 1,
    });
    expectNixParses(result.output);
  });

  test('accepts a direct plugins object and omits disabled plugin enables', () => {
    const result = convertSettingsJsonToNix(
      JSON.stringify({
        AlwaysTrust: {
          domain: false,
          enabled: false,
        },
      })
    );

    expect(result.output).toContain('alwaysTrust = {');
    expect(result.output).not.toContain('enable = false;');
    expect(result.output).toContain('domain = false;');
    expect(result.stats.pluginCount).toBe(1);
    expectNixParses(result.output);
  });

  test('omits known settings when they match schema defaults', () => {
    const result = convertSettingsJsonToNix(
      JSON.stringify({
        settings: {
          plugins: {
            AlwaysExpandRoles: {
              enabled: true,
              hideArrow: false,
            },
          },
        },
      })
    );

    expect(result.output).toContain('alwaysExpandRoles.enable = true;');
    expect(result.output).not.toContain('alwaysExpandRoles = {');
    expect(result.output).not.toContain('hideArrow = false;');
    expectNixParses(result.output);
  });

  test('omits known object, string, number, array, and empty-object defaults', () => {
    const result = convertSettingsJsonToNix(
      JSON.stringify({
        settings: {
          plugins: {
            Questify: {
              enabled: true,
              lastQuestPageFilters: {},
              migrationVersion: 1,
              questOrder: ['UNCLAIMED', 'CLAIMED', 'IGNORED', 'EXPIRED'],
              questTileClaimedColor: {
                color: 6105983,
                enabled: true,
              },
              questTileExpiredColor: {
                color: 2368553,
                enabled: true,
              },
              questTileGradient: 'intense',
              questTileIgnoredColor: {
                color: 8334124,
                enabled: true,
              },
              questTileUnclaimedColor: {
                color: 2842239,
                enabled: true,
              },
            },
          },
        },
      })
    );

    expect(result.output).toContain('questify.enable = true;');
    expect(result.output).not.toContain('lastQuestPageFilters');
    expect(result.output).not.toContain('migrationVersion');
    expect(result.output).not.toContain('questOrder');
    expect(result.output).not.toContain('questTileClaimedColor');
    expect(result.output).not.toContain('questTileExpiredColor');
    expect(result.output).not.toContain('questTileGradient');
    expect(result.output).not.toContain('questTileIgnoredColor');
    expect(result.output).not.toContain('questTileUnclaimedColor');
    expectNixParses(result.output);
  });

  test('maps upstream plugin and setting renames to Nix option names', () => {
    const result = convertSettingsJsonToNix(
      JSON.stringify({
        settings: {
          plugins: {
            CustomRPC: {
              appID: '1234',
              buttonOneURL: 'https://example.com',
              enabled: true,
            },
          },
        },
      })
    );

    expect(result.output).toContain('customRpc = {');
    expect(result.output).toContain('appId = "1234";');
    expect(result.output).toContain('buttonOneUrl = "https://example.com";');
    expect(result.output).not.toContain('appID');
    expect(result.output).not.toContain('buttonOneURL');
    expectNixParses(result.output);
  });

  test('preserves unsupported settings and unknown plugins in extraConfig', () => {
    const result = convertSettingsJsonToNix(
      JSON.stringify({
        settings: {
          plugins: {
            AlwaysTrust: {
              enabled: true,
              futureSetting: 'kept',
            },
            MyUserPlugin: {
              SomeURL: 'https://example.com',
              enabled: true,
              customThing: 7,
            },
          },
        },
      })
    );

    expect(result.output).toContain('programs.nixcord.config.plugins = {');
    expect(result.output).toContain('programs.nixcord.extraConfig.plugins = {');
    expect(result.output).toContain('alwaysTrust = {');
    expect(result.output).toContain('futureSetting = "kept";');
    expect(result.output).toContain('MyUserPlugin = {');
    expect(result.output).toContain('SomeURL = "https://example.com";');
    expect(result.output).toContain('customThing = 7;');
    expect(result.stats).toMatchObject({
      configPluginCount: 1,
      extraPluginCount: 2,
      pluginCount: 2,
      preservedSettingCount: 3,
    });
    expectNixParses(result.output);
  });

  test('ignores upstream internal API and core plugins', () => {
    const result = convertSettingsJsonToNix(
      JSON.stringify({
        settings: {
          plugins: {
            AudioPlayerAPI: {
              enabled: true,
            },
            NoTrack: {
              disableAnalytics: true,
              enabled: true,
            },
            Settings: {
              enabled: true,
              includeVencordInfoWhenCopying: true,
              settingsLocation: 'aboveNitro',
            },
            SupportHelper: {
              enabled: true,
            },
            MyUserPlugin: {
              enabled: true,
              userSetting: 'kept',
            },
          },
        },
      })
    );

    expect(result.output).toContain('MyUserPlugin = {');
    expect(result.output).toContain('enable = true;');
    expect(result.output).toContain('userSetting = "kept";');
    expect(result.output).not.toContain('AudioPlayerAPI');
    expect(result.output).not.toContain('NoTrack');
    expect(result.output).not.toContain('Settings = {');
    expect(result.output).not.toMatch(/(^|\s)Settings\.enable/);
    expect(result.output).not.toContain('SupportHelper');
    expect(result.stats.extraPluginCount).toBe(1);
    expectNixParses(result.output);
  });

  test('includes quickCss when present', () => {
    const result = convertSettingsJsonToNix(
      JSON.stringify({
        quickCss: '.foo { content: "${bar}"; }',
        settings: {
          plugins: {
            AlwaysTrust: {
              enabled: true,
            },
          },
        },
      })
    );

    expect(result.output).toContain('programs.nixcord.config.useQuickCss = true;');
    expect(result.output).toContain('programs.nixcord.quickCss = ');
    expect(result.output).toContain('quickCss = ".foo { content: \\"\\${bar}\\"; }";');
    expectNixParses(result.output);
  });

  test('throws a useful error for malformed JSON', () => {
    expect(() => convertSettingsJsonToNix('{ "settings": ')).toThrow(/Invalid JSON:/);
  });

  test('throws a useful error when no plugin map exists', () => {
    expect(() => convertSettingsJsonToNix(JSON.stringify({ settings: { useQuickCss: true } }))).toThrow(
      'Expected Vencord/Equicord settings with a plugins object.'
    );
  });

  test('throws when the input only contains default or disabled settings', () => {
    expect(() =>
      convertSettingsJsonToNix(
        JSON.stringify({
          settings: {
            plugins: {
              AlwaysExpandRoles: {
                enabled: false,
                hideArrow: false,
              },
            },
          },
        })
      )
    ).toThrow('No non-default plugin settings were found in this JSON.');
  });

  test('ignores non-object plugin entries without crashing', () => {
    const result = convertSettingsJsonToNix(
      JSON.stringify({
        settings: {
          plugins: {
            AlwaysTrust: {
              enabled: true,
            },
            BrokenPlugin: true,
          },
        },
      })
    );

    expect(result.output).toContain('alwaysTrust.enable = true;');
    expect(result.output).not.toContain('BrokenPlugin');
    expectNixParses(result.output);
  });

  test('quotes odd unknown plugin and setting names into valid Nix', () => {
    const result = convertSettingsJsonToNix(
      JSON.stringify({
        settings: {
          plugins: {
            'User Plugin.With-Dot': {
              'setting.with.dot': true,
              enabled: true,
            },
          },
        },
      })
    );

    expect(result.output).toContain('"User Plugin.With-Dot" = {');
    expect(result.output).toContain('"setting.with.dot" = true;');
    expectNixParses(result.output);
  });

  test('ignores unknown enable-only plugins as stale upstream noise', () => {
    expect(() =>
      convertSettingsJsonToNix(
        JSON.stringify({
          settings: {
            plugins: {
              'User Plugin.With-Dot': {
                enabled: true,
              },
            },
          },
        })
      )
    ).toThrow('No non-default plugin settings were found in this JSON.');
  });

  test('preserves arrays, nested objects, nulls, and escaped strings', () => {
    const result = convertSettingsJsonToNix(
      JSON.stringify({
        settings: {
          plugins: {
            MyUserPlugin: {
              enabled: true,
              nested: {
                text: 'quote " slash \\\\ anti ${value}\nnext',
              },
              nothing: null,
              values: [1, true, 'x'],
            },
          },
        },
      })
    );

    expect(result.output).toContain('MyUserPlugin = {');
    expect(result.output).toContain('nothing = null;');
    expect(result.output).toContain('values = [ 1 true "x" ];');
    expect(result.output).toContain('anti \\${value}\\nnext');
    expectNixParses(result.output);
  });

  test('stress converts a large mixed plugin map into parseable Nix', () => {
    const plugins: Record<string, unknown> = {
      AlwaysTrust: {
        domain: false,
        enabled: true,
        file: true,
      },
      MutualGroupDMs: {
        enabled: true,
      },
    };

    for (let index = 0; index < 80; index += 1) {
      plugins[`User Plugin ${index}.With Dot`] = {
        enabled: index % 3 === 0,
        nested: {
          flag: index % 2 === 0,
          text: `value "${index}" \${kept}`,
        },
        number: index,
        values: [index, `item-${index}`, null],
      };
    }

    const result = convertSettingsJsonToNix(JSON.stringify({ settings: { plugins } }));

    expect(result.output).toContain('mutualGroupDms.enable = true;');
    expect(result.output).toContain('"User Plugin 0.With Dot" = {');
    expect(result.output).not.toContain('enable = false;');
    expect(result.stats.pluginCount).toBe(82);
    expectNixParses(result.output);
  });

  test.skipIf(!existsSync(realEquicordSettingsPath))(
    'converts the local Equicord settings file without default-false noise',
    () => {
      const input = readFileSync(realEquicordSettingsPath, 'utf8');
      const result = convertSettingsJsonToNix(input);

      expect(result.output).toContain('programs.nixcord.config.plugins = {');
      expect(result.output).not.toContain('programs = {');
      expect(result.output).not.toContain('nixcord = {');
      expect(result.output).not.toContain('enable = false;');
      expect(result.output).not.toContain('hideArrow = false;');
      expect(result.output).not.toContain('keepOpen = false;');
      expect(result.output).not.toContain('questTileClaimedColor');
      expect(result.output).not.toContain('questTileExpiredColor');
      expect(result.output).not.toContain('questTileIgnoredColor');
      expect(result.output).not.toContain('questTileUnclaimedColor');
      expect(result.output).not.toContain('AudioPlayerAPI');
      expect(result.output).not.toContain('ChatInputButtonAPI');
      expect(result.output).not.toContain('CommandsAPI');
      expect(result.output).not.toContain('NoTrack');
      expect(result.output).not.toContain('programs.nixcord.extraConfig.plugins');
      expect(result.output).not.toContain('Settings = {');
      expect(result.output).not.toMatch(/(^|\s)Settings\.enable/);
      expect(result.output).not.toContain('SupportHelper');
      expect(result.output).not.toContain('FriendsSince');
      expect(result.output).toContain('mutualGroupDms.enable = true;');
      expect(result.stats.pluginCount).toBeGreaterThan(0);
      expect(result.stats.configPluginCount).toBeGreaterThan(0);
      expectNixParses(result.output);
    }
  );
});
