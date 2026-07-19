import type { PluginConfig, PluginSetting } from '@nixcord/shared';
import { SyntaxKind } from 'ts-morph';
import { describe, expect, test } from 'vitest';
import { extractSettingsFromObject } from '../../../../../src/extractor/settings-extractor.js';
import { createProject, loadFixture } from '../../../../helpers/test-utils.js';

describe('extractSettingsFromObject()', () => {
  test('recursive settings extraction', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-object/01-recursive-settings-extraction.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('settings')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    const result = extractSettingsFromObject(objLiteral, checker, program);
    expect(result.nested).toBeDefined();
    expect(result.nested?.name).toBe('nested');
  });

  test('handles deeply nested settings (2 levels)', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-object/02-handles-deeply-nested-settings-2-levels.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('settings')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    const result = extractSettingsFromObject(objLiteral, checker, program);
    expect(result.level1).toBeDefined();
    expect(result.level1?.name).toBe('level1');
    if (result.level1 && 'settings' in result.level1) {
      const settings = (result.level1 as PluginConfig).settings;
      expect(settings.level2).toBeDefined();
    }
  });

  test('handles 3+ levels of nesting', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-object/03-handles-3-levels-of-nesting.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('settings')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    const result = extractSettingsFromObject(objLiteral, checker, program);
    expect(result.config).toBeDefined();
    expect(result.config?.name).toBe('config');
    if (result.config && 'settings' in result.config) {
      const configSettings = (result.config as PluginConfig).settings;
      expect(configSettings.deep).toBeDefined();
      const deep = configSettings.deep as PluginConfig;
      if (deep && 'settings' in deep) {
        const deepSettings = deep.settings;
        expect(deepSettings.deeper).toBeDefined();
        const deeper = deepSettings.deeper as PluginSetting;
        if (deeper && 'type' in deeper) {
          expect(deeper.type).toBe('types.int');
          expect(deeper.default).toBe(42);
        }
      }
    }
  });

  test('handles multiple nested groups at same level', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-object/04-handles-multiple-nested-groups-at-same-level.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('settings')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    const result = extractSettingsFromObject(objLiteral, checker, program);
    expect(result.group1).toBeDefined();
    expect(result.group2).toBeDefined();
    expect(result.group3).toBeDefined();
    if (result.group1 && 'settings' in result.group1) {
      const settings = (result.group1 as PluginConfig).settings;
      expect(settings.nested1).toBeDefined();
    }
    if (result.group2 && 'settings' in result.group2) {
      const settings = (result.group2 as PluginConfig).settings;
      expect(settings.nested2).toBeDefined();
    }
    if (result.group3 && 'settings' in result.group3) {
      const settings = (result.group3 as PluginConfig).settings;
      expect(settings.nested3).toBeDefined();
    }
  });

  test('filters hidden at all levels', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-object/05-filters-hidden-at-all-levels.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('settings')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    const result = extractSettingsFromObject(objLiteral, checker, program);
    expect(result.visible).toBeDefined();
    expect(result.hidden).toBeUndefined();
  });

  test('handles restart required in nested extraction', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-object/06-handles-restart-required-in-nested-extraction.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('settings')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    const result = extractSettingsFromObject(objLiteral, checker, program);
    const setting = result.setting;
    if (setting && 'description' in setting) {
      expect(setting.description).toContain('(restart required)');
    }
  });

  test('handles empty object', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-object/07-handles-empty-object.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('settings')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    const result = extractSettingsFromObject(objLiteral, checker, program);
    expect(Object.keys(result)).toHaveLength(0);
  });

  test('handles non-object initializers', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-object/08-handles-non-object-initializers.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('settings')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    const result = extractSettingsFromObject(objLiteral, checker, program);
    expect(result.invalid).toBeUndefined();
  });

  test('handles COMPONENT type with object default (consoleJanitor pattern)', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-object/09-handles-component-type-with-object-default-console-janitor-pattern.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('settings')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    const result = extractSettingsFromObject(objLiteral, checker, program);
    expect(result.allowLevel).toBeDefined();
    const allowLevel = result.allowLevel;
    if (allowLevel && 'type' in allowLevel) {
      // COMPONENT type should be inferred from default object
      expect(allowLevel.type).toBeDefined();
      // Default should be extracted as object
      expect(allowLevel.default).toBeDefined();
      if (typeof allowLevel.default === 'object' && allowLevel.default !== null) {
        const defaultObj = allowLevel.default as Record<string, unknown>;
        expect(defaultObj.error).toBe(true);
        expect(defaultObj.warn).toBe(false);
      }
    }
  });

  test('handles CUSTOM type with nested structure (pinDms pattern)', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-object/10-handles-custom-type-with-nested-structure-pin-dms-pattern.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('settings')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    const result = extractSettingsFromObject(objLiteral, checker, program);
    expect(result.userBasedCategoryList).toBeDefined();
    const custom = result.userBasedCategoryList;
    if (custom && 'type' in custom) {
      // CUSTOM type should be inferred from default object
      expect(custom.type).toBeDefined();
      // Default should be extracted as empty object
      expect(custom.default).toBeDefined();
      if (typeof custom.default === 'object' && custom.default !== null) {
        expect(Object.keys(custom.default)).toHaveLength(0);
      }
    }
  });

  test('handles very deep nesting (4+ levels)', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-object/11-handles-very-deep-nesting-4-levels.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('settings')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    const result = extractSettingsFromObject(objLiteral, checker, program);

    expect(result.level1).toBeDefined();
    const level1 = result.level1;
    if (level1 && 'settings' in level1) {
      const level1Settings = (level1 as PluginConfig).settings;
      expect(level1Settings.level2).toBeDefined();
      const level2 = level1Settings.level2 as PluginConfig;
      if (level2 && 'settings' in level2) {
        const level2Settings = level2.settings;
        expect(level2Settings.level3).toBeDefined();
        const level3 = level2Settings.level3 as PluginConfig;
        if (level3 && 'settings' in level3) {
          const level3Settings = level3.settings;
          expect(level3Settings.level4).toBeDefined();
          const level4 = level3Settings.level4 as PluginSetting;
          if (level4 && 'type' in level4) {
            expect(level4.type).toBe('types.str');
            expect(level4.default).toBe('deep-value');
          }

          expect(level3Settings.level4b).toBeDefined();
          const level4b = level3Settings.level4b as PluginSetting;
          if (level4b && 'type' in level4b) {
            expect(level4b.type).toBe('types.int');
            expect(level4b.default).toBe(42);
          }
        }

        expect(level2Settings.level3b).toBeDefined();
        const level3b = level2Settings.level3b as PluginSetting;
        if (level3b && 'type' in level3b) {
          expect(level3b.type).toBe('types.bool');
          expect(level3b.default).toBe(true);
        }
      }
    }
  });

  test('handles malformed settings structure gracefully', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/settings-extractor/extract-from-object/12-handles-malformed-settings-structure-gracefully.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('settings')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    const result = extractSettingsFromObject(objLiteral, checker, program);

    // Valid setting should be extracted
    expect(result.valid).toBeDefined();
    // Invalid settings should be skipped
    expect(result.invalid).toBeUndefined();
    expect(result.alsoInvalid).toBeUndefined();
  });
});
