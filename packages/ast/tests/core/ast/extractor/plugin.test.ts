import { SyntaxKind } from 'ts-morph';
import { describe, expect, test } from 'vitest';
import { extractPluginInfo } from '../../../../src/extractor/plugin.js';
import { findDefinePluginSettings } from '../../../../src/navigator/plugin-navigator.js';
import { createProject, loadFixture } from '../../../helpers/test-utils.js';

describe('extractPluginInfo()', () => {
  test('extracts plugin name', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/plugin/01-extracts-plugin-name.ts')
    );
    const checker = project.getTypeChecker();
    const result = extractPluginInfo(sourceFile, checker);
    expect(result.name).toBe('TestPlugin');
  });

  test('extracts plugin description', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/plugin/02-extracts-plugin-description.ts')
    );
    const checker = project.getTypeChecker();
    const result = extractPluginInfo(sourceFile, checker);
    expect(result.description).toBe('Test description');
  });

  test('handles missing definePlugin call', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/plugin/03-handles-missing-define-plugin-call.ts')
    );
    const checker = project.getTypeChecker();
    const result = extractPluginInfo(sourceFile, checker);
    expect(result).toEqual({});
  });

  test('handles missing name/description', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/plugin/04-handles-missing-name-description.ts')
    );
    const checker = project.getTypeChecker();
    const result = extractPluginInfo(sourceFile, checker);
    expect(result).toEqual({});
  });

  test('extracts both name and description', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/plugin/05-extracts-both-name-and-description.ts')
    );
    const checker = project.getTypeChecker();
    const result = extractPluginInfo(sourceFile, checker);
    expect(result.name).toBe('MyPlugin');
    expect(result.description).toBe('My description');
  });
});

describe('findDefinePluginSettings()', () => {
  test('finds correct call expression', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/plugin/07-finds-correct-call-expression.ts')
    );
    const result = findDefinePluginSettings(sourceFile);
    expect(result).toBeDefined();
    const callExpr = result;
    expect(callExpr?.getExpression().getText()).toBe('definePluginSettings');
  });

  test('returns nothing when not found', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/plugin/08-returns-nothing-when-not-found.ts')
    );
    const result = findDefinePluginSettings(sourceFile);
    expect(result).toBeUndefined();
  });

  test('finds nested call expression', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/plugin/09-finds-nested-call-expression.ts')
    );
    const result = findDefinePluginSettings(sourceFile);
    expect(result?.getExpression().getText()).toBe('definePluginSettings');
  });

  test('finds definePluginSettings with withPrivateSettings chained call', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'settings.ts',
      loadFixture(
        'core/ast/extractor/plugin/10-finds-define-plugin-settings-with-with-private-settings-chained-call.ts'
      )
    );
    const result = findDefinePluginSettings(sourceFile);
    expect(result?.getExpression().getText()).toBe('definePluginSettings');
  });

  test('finds definePluginSettings with multiple chained calls', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'settings.ts',
      loadFixture(
        'core/ast/extractor/plugin/11-finds-define-plugin-settings-with-multiple-chained-calls.ts'
      )
    );
    const result = findDefinePluginSettings(sourceFile);
    expect(result?.getExpression().getText()).toBe('definePluginSettings');
  });

  test('handles definePlugin with computed name/description', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/plugin/12-handles-define-plugin-with-computed-name-description.ts'
      )
    );
    const checker = project.getTypeChecker();
    const result = extractPluginInfo(sourceFile, checker);
    // Should return empty object when name/description are computed
    expect(result).toEqual({});
  });

  test('handles definePlugin with missing properties', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/plugin/13-handles-define-plugin-with-missing-properties.ts')
    );
    const checker = project.getTypeChecker();
    const result = extractPluginInfo(sourceFile, checker);
    expect(result.name).toBe('TestPlugin');
    expect(result.description).toBeUndefined();
  });
});
