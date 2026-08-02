import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ParsedPluginsResultSchema, type PluginSetting } from '@nixcord/shared';
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
        'NoTrack',
      ])
    );

    expect(plugins['Shared Plugin']?.settings).toMatchObject({
      mode: {
        type: { kind: 'enum', values: ['default', 'alt'] },
        default: 'default',
      },
      message: { type: { kind: 'string', nullable: false }, default: 'vencord' },
    });
    expect((plugins.NestedSettings?.settings.enabled as PluginSetting).default).toBe(true);
    expect((plugins.NoNamePlugin?.settings.message as PluginSetting).default).toBe('hello');
    expect(plugins['No Settings']?.settings).toEqual({});
    expect(plugins.NoTrack).toMatchObject({
      directoryName: '_core/noTrack.ts',
      settings: {
        disableAnalytics: {
          type: { kind: 'boolean' },
          default: true,
          restartNeeded: true,
        },
      },
    });

    expect(plugins.DiscordEnum?.settings.activity).toMatchObject({
      type: { kind: 'enum', values: [0, 1, 2] },
      default: 1,
    });
    expect(plugins.CustomRPC?.settings.config).toBeUndefined();
    expect(plugins.CustomRPC?.settings.appID).toMatchObject({
      type: { kind: 'string', nullable: true },
      default: null,
    });
    expect(plugins.CustomRPC?.settings.type).toMatchObject({
      type: { kind: 'enum', values: [0, 1, 2, 3, 4, 5, 6] },
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
          code: 'component-ui-only',
          stage: 'normalization',
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

  test('preserves defaults and metadata when a setting definition object is reused', async () => {
    await using fixture = await createFixture({
      'src/plugins/reused/index.ts': `
        import { definePluginSettings } from "@api/Settings";
        import definePlugin, { OptionType } from "@utils/types";

        const shared = {
          type: OptionType.STRING,
          default: "same",
          description: "shared definition",
        };
        const settings = definePluginSettings({ first: shared, second: shared });

        export default definePlugin({
          name: "ReusedDefinition",
          description: "fixture",
          settings,
        });
      `,
    });

    const result = await parsePlugins(fixture.path, { executionMode: 'disabled' });
    expect(result.vencordPlugins.ReusedDefinition?.settings).toMatchObject({
      first: {
        type: { kind: 'string', nullable: false },
        default: 'same',
        description: 'shared definition',
      },
      second: {
        type: { kind: 'string', nullable: false },
        default: 'same',
        description: 'shared definition',
      },
    });
  });

  test('finds component-backed settings persisted outside the settings component', async () => {
    await using fixture = await createFixture({
      'src/plugins/folder-icons/settings.tsx': `
        import { definePluginSettings } from "@api/Settings";
        import { OptionType } from "@utils/types";

        export const settings = definePluginSettings({
          folderIcons: {
            type: OptionType.COMPONENT,
            hidden: true,
            description: "Per-folder icon data",
            component: () => <></>,
          },
        });
      `,
      'src/plugins/folder-icons/store.ts': `
        import { settings } from "./settings";

        export function initializeFolderIcons() {
          settings.store.folderIcons ??= {};
        }
      `,
      'src/plugins/folder-icons/index.tsx': `
        import definePlugin from "@utils/types";
        import { settings } from "./settings";
        import { initializeFolderIcons } from "./store";

        export function getFolderIcons() {
          initializeFolderIcons();
          return settings.store.folderIcons;
        }

        export default definePlugin({
          name: "FolderIcons",
          description: "fixture",
          settings,
        });
      `,
    });

    const result = await parsePlugins(fixture.path, { executionMode: 'disabled' });
    expect(result.vencordPlugins.FolderIcons?.settings.folderIcons).toMatchObject({
      type: { kind: 'attrs', nullable: false },
      default: {},
      hidden: true,
      description: 'Per-folder icon data',
    });
    expect(result.diagnostics).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pluginName: 'FolderIcons',
          settingPath: 'folderIcons',
          code: 'component-ui-only',
        }),
      ])
    );
  });

  test('uses executed control evidence for dynamically indexed store settings', async () => {
    await using fixture = await createFixture({
      'src/plugins/dynamic-switch/index.tsx': `
        import { definePluginSettings } from "@api/Settings";
        import { Switch } from "@webpack/common";
        import definePlugin, { OptionType } from "@utils/types";

        const keys = ["flag"];
        const settings = definePluginSettings({
          flag: {
            type: OptionType.COMPONENT,
            component: () => {
              const key = keys.at(0)!;
              return <Switch
                value={settings.store[key]}
                onChange={value => settings.store[key] = value}
              />;
            },
          },
        });

        export default definePlugin({
          name: "DynamicSwitch",
          description: "fixture",
          settings,
        });
      `,
    });

    const result = await parsePlugins(fixture.path, { executionMode: 'fallback' });
    expect(result.vencordPlugins.DynamicSwitch?.settings.flag).toMatchObject({
      type: { kind: 'boolean' },
    });
    expect((result.vencordPlugins.DynamicSwitch?.settings.flag as PluginSetting).default).toBe(
      undefined
    );
  });

  test('traces component settings through renamed settings bindings', async () => {
    await using fixture = await createFixture({
      'src/plugins/renamed-binding/component.tsx': `
        import { Switch } from "@webpack/common";
        import { pluginSettings as config } from "./index";

        export function FlagComponent() {
          return (
            <Switch
              value={config.store.flag}
              onChange={value => config.store.flag = value}
            />
          );
        }
      `,
      'src/plugins/renamed-binding/settings.ts': `
        import { definePluginSettings } from "@api/Settings";
        import { OptionType } from "@utils/types";
        import { FlagComponent } from "./component";

        export const pluginSettings = definePluginSettings({
          flag: {
            type: OptionType.COMPONENT,
            component: FlagComponent,
          },
        });
      `,
      'src/plugins/renamed-binding/index.ts': `
        import definePlugin from "@utils/types";
        import { pluginSettings } from "./settings";
        export { pluginSettings };

        export default definePlugin({
          name: "RenamedBinding",
          description: "fixture",
          settings: pluginSettings,
        });
      `,
    });

    const result = await parsePlugins(fixture.path);
    expect(result.vencordPlugins.RenamedBinding?.settings.flag).toMatchObject({
      type: { kind: 'boolean' },
    });
    expect(result.diagnostics).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pluginName: 'RenamedBinding',
          settingPath: 'flag',
          code: 'component-ui-only',
        }),
      ])
    );
  });

  test('preserves list element types and uses anything for heterogeneous arrays', async () => {
    await using fixture = await createFixture({
      'src/plugins/list-types/index.ts': `
        import { definePluginSettings } from "@api/Settings";
        import definePlugin, { OptionType } from "@utils/types";

        const settings = definePluginSettings({
          records: { type: OptionType.CUSTOM, default: [] as Array<{ id: string }> },
          numbers: { type: OptionType.CUSTOM, default: [1, 2] as number[] },
          booleans: { type: OptionType.CUSTOM, default: [true, false] as boolean[] },
          mixed: { type: OptionType.CUSTOM, default: [1, "two"] },
          unknownEmpty: { type: OptionType.CUSTOM, default: [] },
        });

        export default definePlugin({ name: "ListTypes", description: "fixture", settings });
      `,
    });

    const result = await parsePlugins(fixture.path, { executionMode: 'disabled' });
    expect(result.vencordPlugins.ListTypes?.settings).toMatchObject({
      records: { type: { kind: 'list', element: 'attrs' }, default: [] },
      numbers: { type: { kind: 'list', element: 'number' }, default: [1, 2] },
      booleans: { type: { kind: 'list', element: 'boolean' }, default: [true, false] },
      mixed: { type: { kind: 'list', element: 'anything' }, default: [1, 'two'] },
      unknownEmpty: { type: { kind: 'list', element: 'anything' }, default: [] },
    });
  });

  test('does not invent a default when a platform-dependent default is unresolved', async () => {
    await using fixture = await createFixture({
      'src/plugins/platform-default/index.tsx': `
        import { definePluginSettings } from "@api/Settings";
        import { TextInput } from "@webpack/common";
        import definePlugin, { OptionType } from "@utils/types";

        const platformDefault = IS_MAC ? ["Meta", "P"] : ["Control", "P"];
        const settings = definePluginSettings({
          hotkey: {
            type: OptionType.COMPONENT,
            default: platformDefault,
            component: () => (
              <TextInput
                value={settings.store.hotkey.join("+")}
                onChange={value => settings.store.hotkey = value.split("+")}
              />
            ),
          },
        });

        export default definePlugin({ name: "PlatformDefault", description: "fixture", settings });
      `,
    });

    const result = await parsePlugins(fixture.path, { executionMode: 'disabled' });
    const hotkey = result.vencordPlugins.PlatformDefault?.settings.hotkey as PluginSetting;
    expect(hotkey.type).toEqual({ kind: 'list', element: 'string' });
    expect(hotkey.default).toBeUndefined();
  });

  test('omits non-finite defaults without producing invalid parser output', async () => {
    await using fixture = await createFixture({
      'src/plugins/non-finite/index.ts': `
        import { definePluginSettings } from "@api/Settings";
        import definePlugin, { OptionType } from "@utils/types";

        const settings = definePluginSettings({
          threshold: { type: OptionType.NUMBER, default: Infinity },
        });

        export default definePlugin({ name: "NonFinite", description: "fixture", settings });
      `,
    });

    const result = await parsePlugins(fixture.path, { executionMode: 'disabled' });
    expect(result.vencordPlugins.NonFinite?.settings.threshold).toMatchObject({
      type: { kind: 'float' },
    });
    expect((result.vencordPlugins.NonFinite?.settings.threshold as PluginSetting).default).toBe(
      undefined
    );
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pluginName: 'NonFinite',
          settingPath: 'threshold',
          code: 'unsupported-default-value',
        }),
      ])
    );
    expect(ParsedPluginsResultSchema.safeParse(result).success).toBe(true);
  });
});
