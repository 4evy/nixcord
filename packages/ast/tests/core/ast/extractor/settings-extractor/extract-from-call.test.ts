import type { PluginConfig, PluginSetting } from '@nixcord/shared';
import { SyntaxKind } from 'ts-morph';
import { describe, expect, test } from 'vitest';
import {
  extractSettingsFromCall,
  extractSettingsFromCallDetailed,
} from '../../../../../src/extractor/settings-extractor.js';
import { findDefinePluginSettings } from '../../../../../src/navigator/plugin-navigator.js';
import { createProject, loadFixture } from '../../../../helpers/test-utils.js';

describe('extractSettingsFromCall()', () => {
  test('extracts simple settings', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-call/01-extracts-simple-settings.ts'
      )
    );
    const callExpr = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)[0];
    if (!callExpr) {
      throw new Error('Call expression not found');
    }
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    const result = extractSettingsFromCall(callExpr, checker, program);
    expect(result.setting1).toBeDefined();
    expect(result.setting1?.name).toBe('setting1');
    if (result.setting1 && 'type' in result.setting1) {
      expect(result.setting1.type).toBe('types.str');
    }
  });

  test('emits numeric enum literals for SELECT options', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-call/02-emits-numeric-enum-literals-for-select-options.ts'
      )
    );
    const callExpr = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)[0];
    if (!callExpr) throw new Error('Call expression not found');
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    const result = extractSettingsFromCall(callExpr, checker, program);
    const iconSpacing = result.iconSpacing as PluginSetting;
    expect(iconSpacing.enumValues).toEqual([0, 1]);
    expect(iconSpacing.default).toBe(1);
  });

  test('extracts SELECT options from const object property access values', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-call/03-extracts-select-options-from-const-object-property-access-values.ts'
      )
    );
    const callExpr = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)[0];
    if (!callExpr) throw new Error('Call expression not found');
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    const result = extractSettingsFromCall(callExpr, checker, program);
    const gifQuality = result.gifQuality as PluginSetting;
    expect(gifQuality.enumValues).toEqual([1, 2, 3, 4]);
    expect(gifQuality.default).toBe(1);
    expect(gifQuality.description).toBe('GIF quality');
  });

  test('keeps string literal enums as strings', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-call/04-keeps-string-literal-enums-as-strings.ts'
      )
    );
    const callExpr = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)[0];
    if (!callExpr) throw new Error('Call expression not found');
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    const result = extractSettingsFromCall(callExpr, checker, program);
    const automod = result.automodEmbeds as PluginSetting;
    expect(automod.enumValues).toEqual(['always', 'never']);
    expect(automod.enumValues).toEqual(['always', 'never']);
  });

  test('extracts nested settings (PluginConfig)', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-call/05-extracts-nested-settings-plugin-config.ts'
      )
    );
    const callExpr = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)[0];
    if (!callExpr) {
      throw new Error('Call expression not found');
    }
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    const result = extractSettingsFromCall(callExpr, checker, program);
    expect(result.config).toBeDefined();
    if (result.config && 'settings' in result.config) {
      const settings = (result.config as PluginConfig).settings;
      expect(settings.nested).toBeDefined();
    }
  });

  test('filters hidden settings', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-call/06-filters-hidden-settings.ts'
      )
    );
    const callExpr = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)[0];
    if (!callExpr) {
      throw new Error('Call expression not found');
    }
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    const result = extractSettingsFromCall(callExpr, checker, program);
    expect(result.visible).toBeDefined();
    expect(result.hidden).toBeUndefined();
  });

  test('handles restart required suffix', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-call/07-handles-restart-required-suffix.ts'
      )
    );
    const callExpr = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)[0];
    if (!callExpr) {
      throw new Error('Call expression not found');
    }
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    const result = extractSettingsFromCall(callExpr, checker, program);
    const setting = result.setting;
    if (setting && 'description' in setting) {
      expect(setting.description).toContain('(restart required)');
    }
  });

  test('handles enum types with OptionType enum (real plugin pattern)', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-call/08-handles-enum-types-with-option-type-enum-real-plugin-pattern.ts'
      )
    );
    const callExpr = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)[0];
    if (!callExpr) {
      throw new Error('Call expression not found');
    }
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    const result = extractSettingsFromCall(callExpr, checker, program);

    const choice = result.choice;
    expect(choice).toBeDefined();
    if (choice && 'type' in choice) {
      expect(choice.type).toContain('enum');
      const enumValues = (choice as PluginSetting).enumValues;
      if (enumValues !== undefined) {
        expect(Array.isArray(enumValues)).toBe(true);
        expect(enumValues.length).toBeGreaterThan(0);
      }
    }

    const enabled = result.enabled;
    expect(enabled).toBeDefined();
    if (enabled && 'type' in enabled) {
      expect(enabled.type).toBe('types.bool');
      expect(enabled.default).toBe(true);
    }

    const message = result.message;
    expect(message).toBeDefined();
    if (message && 'type' in message) {
      expect(message.type).toBe('types.str');
      expect(message.default).toBe('test');
    }
  });

  test('handles all default value types', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-call/09-handles-all-default-value-types.ts'
      )
    );
    const callExpr = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)[0];
    if (!callExpr) {
      throw new Error('Call expression not found');
    }
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    const result = extractSettingsFromCall(callExpr, checker, program);
    const boolSetting = result.boolSetting;
    const strSetting = result.strSetting;
    const intSetting = result.intSetting;
    const floatSetting = result.floatSetting;
    if (boolSetting && 'default' in boolSetting) {
      expect(boolSetting.default).toBe(true);
    }
    if (strSetting && 'default' in strSetting) {
      expect(strSetting.default).toBe('test');
    }
    if (intSetting && 'default' in intSetting) {
      expect(intSetting.default).toBe(42);
    }
    if (floatSetting && 'default' in floatSetting) {
      expect(floatSetting.default).toBe(3.14);
    }
  });

  test('handles missing definePluginSettings call', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-call/10-handles-missing-define-plugin-settings-call.ts'
      )
    );
    const callExpr = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)[0];
    if (!callExpr) {
      // No call expression, so we need to create one manually
      const result = extractSettingsFromCall(
        undefined as unknown as Parameters<typeof extractSettingsFromCall>[0],
        project.getTypeChecker(),
        project.getProgram()
      );
      expect(result).toEqual({});
      return;
    }
    // If it's not definePluginSettings, should return empty
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    const result = extractSettingsFromCall(callExpr, checker, program);
    expect(result).toEqual({});
  });

  test('handles empty settings object', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-call/11-handles-empty-settings-object.ts'
      )
    );
    const callExpr = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)[0];
    if (!callExpr) {
      throw new Error('Call expression not found');
    }
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    const result = extractSettingsFromCall(callExpr, checker, program);
    expect(Object.keys(result)).toHaveLength(0);
  });

  test('treats empty settings object as a valid empty detailed result', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-call/12-treats-empty-settings-object-as-a-valid-empty-detailed-result.ts'
      )
    );
    const callExpr = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)[0];
    if (!callExpr) {
      throw new Error('Call expression not found');
    }

    const result = extractSettingsFromCallDetailed(
      callExpr,
      project.getTypeChecker(),
      project.getProgram()
    );

    expect(result.items).toEqual({});
    expect(result.diagnostics).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.unsupported).toEqual([]);
  });

  test('reports unsupported generated settings patterns in detailed results', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-call/13-reports-unsupported-generated-settings-patterns-in-detailed-results.ts'
      )
    );
    const callExpr = sourceFile
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .find((call) => call.getExpression().getText() === 'definePluginSettings');
    if (!callExpr) {
      throw new Error('Call expression not found');
    }

    const result = extractSettingsFromCallDetailed(
      callExpr,
      project.getTypeChecker(),
      project.getProgram()
    );

    expect(result.items).toEqual({});
    expect(result.unsupported).toMatchObject([{ kind: 'unsupported-generated-settings-pattern' }]);
    expect(result.diagnostics).toMatchObject([{ kind: 'unsupported-generated-settings-pattern' }]);
  });

  test('reports hidden settings as skipped detailed results', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-call/14-reports-hidden-settings-as-skipped-detailed-results.ts'
      )
    );
    const callExpr = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)[0];
    if (!callExpr) {
      throw new Error('Call expression not found');
    }

    const result = extractSettingsFromCallDetailed(
      callExpr,
      project.getTypeChecker(),
      project.getProgram()
    );

    expect(result.items).toEqual({});
    expect(result.skipped).toMatchObject([
      { kind: 'hidden-setting-skipped', key: 'hiddenSetting' },
    ]);
    expect(result.diagnostics).toMatchObject([
      { kind: 'hidden-setting-skipped', key: 'hiddenSetting' },
    ]);
  });

  test('reports component-only settings as skipped detailed results', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.tsx',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-call/15-reports-component-only-settings-as-skipped-detailed-results.tsx'
      )
    );
    const callExpr = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)[0];
    if (!callExpr) {
      throw new Error('Call expression not found');
    }

    const result = extractSettingsFromCallDetailed(
      callExpr,
      project.getTypeChecker(),
      project.getProgram()
    );

    expect(result.items).toEqual({});
    expect(result.skipped).toMatchObject([
      { kind: 'component-only-setting-skipped', key: 'preview' },
    ]);
    expect(result.diagnostics).toMatchObject([
      { kind: 'component-only-setting-skipped', key: 'preview' },
    ]);
  });

  test('extracts private settings from withPrivateSettings type literals', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.tsx',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-call/16-extracts-private-settings-from-with-private-settings-type-literals.tsx'
      )
    );
    const callExpr = findDefinePluginSettings(sourceFile);
    if (!callExpr) throw new Error('Call expression not found');
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    const result = extractSettingsFromCall(callExpr, checker, program);

    expect(result.config).toBeUndefined();

    const appID = result.appID as PluginSetting;
    expect(appID.type).toBe('types.nullOr types.str');
    expect(appID.default).toBeNull();

    const type = result.type as PluginSetting;
    expect(type.type).toBe('types.enum');
    expect(type.enumValues).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(type.default).toBe(0);

    const timestampMode = result.timestampMode as PluginSetting;
    expect(timestampMode.enumValues).toEqual([0, 1, 2, 3]);

    const startTime = result.startTime as PluginSetting;
    expect(startTime.type).toBe('types.int');
    expect(startTime.default).toBe(0);

    const loop = result.loop as PluginSetting;
    expect(loop.type).toBe('types.bool');
    expect(loop.default).toBe(false);

    const multiGreetChoices = result.multiGreetChoices as PluginSetting;
    expect(multiGreetChoices.type).toBe('types.listOf types.str');
    expect(multiGreetChoices.default).toEqual([]);

    const nestedFolders = result.nestedFolders as PluginSetting;
    expect(nestedFolders.type).toBe('types.attrs');
    expect(nestedFolders.default).toEqual({});

    const formats = result.formats as PluginConfig;
    expect((formats.settings.cozyFormat as PluginSetting).type).toBe('types.nullOr types.str');
  });

  test('extracts known external enum private setting types without resolved imports', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-call/17-extracts-known-external-enum-private-setting-types-without-resolved-im.ts'
      )
    );
    const callExpr = findDefinePluginSettings(sourceFile);
    if (!callExpr) throw new Error('Call expression not found');
    const result = extractSettingsFromCall(
      callExpr,
      project.getTypeChecker(),
      project.getProgram()
    );

    const type = result.type as PluginSetting;
    expect(type.type).toBe('types.enum');
    expect(type.enumValues).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(type.default).toBe(0);
  });

  test('handles missing arguments', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-call/18-handles-missing-arguments.ts'
      )
    );
    const callExpr = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)[0];
    if (!callExpr) {
      throw new Error('Call expression not found');
    }
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    const result = extractSettingsFromCall(callExpr, checker, program);
    expect(result).toEqual({});
  });

  test('handles placeholder property', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-call/19-handles-placeholder-property.ts'
      )
    );
    const callExpr = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)[0];
    if (!callExpr) {
      throw new Error('Call expression not found');
    }
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    const result = extractSettingsFromCall(callExpr, checker, program);
    const setting = result.setting;
    if (setting && 'example' in setting) {
      expect(setting.example).toBe('Enter value');
    }
  });

  test('uses name as description fallback', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-call/20-uses-name-as-description-fallback.ts'
      )
    );
    const callExpr = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)[0];
    if (!callExpr) {
      throw new Error('Call expression not found');
    }
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    const result = extractSettingsFromCall(callExpr, checker, program);
    const setting = result.setting;
    if (setting && 'description' in setting) {
      expect(setting.description).toBe('Setting Name');
    }
  });

  test('handles computed defaults with getters (like vcNarrator pattern)', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-call/21-handles-computed-defaults-with-getters-like-vc-narrator-pattern.ts'
      )
    );
    const callExpr = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)[0];
    if (!callExpr) {
      throw new Error('Call expression not found');
    }
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    const result = extractSettingsFromCall(callExpr, checker, program);

    // Computed defaults are represented as nullable (we can't execute getters)
    const voice = result.voice;
    expect(voice).toBeDefined();
    if (voice && 'default' in voice) {
      expect(voice.default).toBeNull();
    }

    // Regular defaults should work
    const volume = result.volume;
    expect(volume).toBeDefined();
    if (volume && 'default' in volume) {
      expect(volume.default).toBe(1);
    }
    if (volume && 'type' in volume) {
      expect(volume.type).toBe('types.float');
    }
  });

  test('extracts settings from Object.entries().map() spreads', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-call/22-extracts-settings-from-object-entries-map-spreads.ts'
      )
    );
    const callExpr = findDefinePluginSettings(sourceFile);
    if (!callExpr) throw new Error('Call expression not found');

    const result = extractSettingsFromCall(
      callExpr,
      project.getTypeChecker(),
      project.getProgram()
    );
    expect(result.list).toMatchObject({
      name: 'list',
      type: 'types.bool',
      default: true,
      description: 'Show indicators in the member list (restart required)',
    });
    expect(result.badges).toBeDefined();
    expect(result.messages).toBeDefined();
    expect(result.colorMobileIndicator).toBeDefined();
  });

  test('extracts reducer-generated settings from direct object literals', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-call/23-extracts-reducer-generated-settings-from-direct-object-literals.ts'
      )
    );
    const callExpr = findDefinePluginSettings(sourceFile);
    if (!callExpr) throw new Error('Call expression not found');

    const result = extractSettingsFromCall(
      callExpr,
      project.getTypeChecker(),
      project.getProgram()
    );
    expect(result.spotify).toMatchObject({
      name: 'spotify',
      type: 'types.bool',
      default: true,
      description: 'Open Spotify links in app',
    });
    expect(result.steam).toBeDefined();
  });

  test('filters hidden reducer-generated settings unless explicitly skipped', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-call/24-filters-hidden-reducer-generated-settings-unless-explicitly-skipped.ts'
      )
    );
    const callExpr = findDefinePluginSettings(sourceFile);
    if (!callExpr) throw new Error('Call expression not found');

    expect(
      extractSettingsFromCall(callExpr, project.getTypeChecker(), project.getProgram()).spotify
    ).toBeUndefined();
    expect(
      extractSettingsFromCall(callExpr, project.getTypeChecker(), project.getProgram(), true)
        .spotify
    ).toBeDefined();
  });

  test('extracts settings from array map spreads with JSON.stringify defaults', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-call/25-extracts-settings-from-array-map-spreads-with-json-stringify-defaults.ts'
      )
    );
    const callExpr = findDefinePluginSettings(sourceFile);
    if (!callExpr) throw new Error('Call expression not found');

    const result = extractSettingsFromCall(
      callExpr,
      project.getTypeChecker(),
      project.getProgram(),
      true
    );
    expect(result.call_calling).toMatchObject({
      name: 'call_calling',
      type: 'types.str',
      description: 'Override for Call Calling',
      default: '{"enabled":false,"selectedSound":"default","volume":100,"useFile":false}',
    });
    expect(result.mute).toBeDefined();
    expect(result.overrides).toBeUndefined();
  });

  test('classifies component defaults from conditional string-array constants', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.tsx',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-call/26-classifies-component-defaults-from-conditional-string-array-constants.tsx'
      )
    );
    const callExpr = findDefinePluginSettings(sourceFile);
    if (!callExpr) throw new Error('Call expression not found');

    const result = extractSettingsFromCall(
      callExpr,
      project.getTypeChecker(),
      project.getProgram()
    );
    expect(result.hotkey).toMatchObject({
      name: 'hotkey',
      type: 'types.listOf types.str',
      default: [],
    });
  });

  test('extracts store-backed bare component settings', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.tsx',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-call/27-extracts-store-backed-bare-component-settings.tsx'
      )
    );
    const callExpr = findDefinePluginSettings(sourceFile);
    if (!callExpr) throw new Error('Call expression not found');

    const result = extractSettingsFromCall(
      callExpr,
      project.getTypeChecker(),
      project.getProgram()
    );
    expect(result.soundId).toMatchObject({
      name: 'soundId',
      type: 'types.nullOr types.str',
      default: null,
      description: 'Enter the ID of the sound you want to play.',
    });
    expect(result.scanQr).toBeUndefined();
  });

  test('extracts structured settings from array-backed component stores', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.tsx',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-call/28-extracts-structured-settings-from-array-backed-component-stores.tsx'
      )
    );
    const callExpr = findDefinePluginSettings(sourceFile);
    if (!callExpr) throw new Error('Call expression not found');

    const result = extractSettingsFromCall(
      callExpr,
      project.getTypeChecker(),
      project.getProgram()
    );
    expect(result.tagSettings).toMatchObject({
      name: 'tagSettings',
      settings: {
        WEBHOOK: {
          name: 'WEBHOOK',
          settings: {
            text: {
              name: 'text',
              type: 'types.str',
              default: 'Webhook',
              description: 'Text for Webhook tag',
            },
            showInChat: {
              name: 'showInChat',
              type: 'types.bool',
              default: true,
              description: 'Show Webhook tag in messages',
            },
            showInNotChat: {
              name: 'showInNotChat',
              type: 'types.bool',
              default: true,
              description: 'Show Webhook tag in member list and profiles',
            },
          },
        },
        MODERATOR_STAFF: {
          name: 'MODERATOR_STAFF',
          settings: {
            text: {
              name: 'text',
              type: 'types.str',
              default: 'Staff',
              description: 'Text for Staff tag',
            },
          },
        },
      },
    });
  });

  test('extracts store-backed component settings through rendered child components', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.tsx',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-call/29-extracts-store-backed-component-settings-through-rendered-child-compon.tsx'
      )
    );
    const callExpr = findDefinePluginSettings(sourceFile);
    if (!callExpr) throw new Error('Call expression not found');

    const result = extractSettingsFromCall(
      callExpr,
      project.getTypeChecker(),
      project.getProgram()
    );
    expect(result.streamMedia).toMatchObject({
      name: 'streamMedia',
      type: 'types.nullOr types.str',
      default: null,
    });
  });

  test('extracts store-backed component settings through wrapped factory components', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.tsx',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-call/30-extracts-store-backed-component-settings-through-wrapped-factory-compo.tsx'
      )
    );
    const callExpr = findDefinePluginSettings(sourceFile);
    if (!callExpr) throw new Error('Call expression not found');

    const result = extractSettingsFromCall(
      callExpr,
      project.getTypeChecker(),
      project.getProgram()
    );
    expect(result.imageCacheDir).toMatchObject({
      name: 'imageCacheDir',
      type: 'types.nullOr types.str',
      default: null,
      description: 'Select saved images directory',
    });
  });
});
