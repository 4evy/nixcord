import { SyntaxKind } from 'ts-morph';
import { describe, expect, test, vi } from 'vitest';
import { extractSelectOptions } from '../../../../../src/extractor/select/index.js';
import { evaluateThemesValues } from '../../../../../src/foundation/index.js';
import * as resolve from '../../../../../src/foundation/resolve.js';
import {
  createProject,
  expectResultError,
  loadFixture,
  unwrapResult,
} from '../../../../helpers/test-utils.js';

describe('extractSelectOptions()', () => {
  test('handles spread arrays in options', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/select/extract-options/01-handles-spread-arrays-in-options.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractSelectOptions(objLiteral, checker));
    expect(result).toBeDefined();
    expect(result!.values).toEqual([0, 1, 2]);
    expect(result!.labels).toEqual({ 0: 'A', 1: 'B', 2: 'C' });
  });

  test('handles Object.keys(obj).map pattern with as const', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/select/extract-options/02-handles-object-keys-obj-map-pattern-with-as-const.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractSelectOptions(objLiteral, checker));
    // Should now extract keys from the Methods object
    expect(result).toBeDefined();
    expect(result!.values).toEqual(['Random', 'Constant']);
  });

  test('handles themeNames.map pattern (Object.keys(themes) as const)', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/select/extract-options/03-handles-theme-names-map-pattern-object-keys-themes-as-const.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractSelectOptions(objLiteral, checker));
    // Should extract theme URLs or at least the keys
    expect(result).toBeDefined();
    if (result) {
      expect(result.values.length).toBeGreaterThan(0);
    }
  });

  test('handles Object.values().map() pattern', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/select/extract-options/04-handles-object-values-map-pattern.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractSelectOptions(objLiteral, checker));
    // Should extract values from object
    expect(result).toBeDefined();
    expect(result!.values).toEqual(['value1', 'value2']);
  });

  test('handles Array.from() pattern with array literal', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/select/extract-options/05-handles-array-from-pattern-with-array-literal.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractSelectOptions(objLiteral, checker));
    expect(result).toBeDefined();
    expect(result!.values).toEqual([1, 2, 3]);
  });

  test('handles Array.from() pattern with identifier', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/select/extract-options/06-handles-array-from-pattern-with-identifier.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractSelectOptions(objLiteral, checker));
    expect(result).toBeDefined();
    expect(result!.values).toEqual(['en', 'ja', 'es']);
  });

  test('handles boolean enum detection (converts to bool type)', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/select/extract-options/07-handles-boolean-enum-detection-converts-to-bool-type.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractSelectOptions(objLiteral, checker));
    // Boolean enum should be detected and handled specially by the caller
    expect(result).toBeDefined();
    expect(result!.values).toEqual([true, false]);
  });
  test('extracts string values from array', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/select/extract-options/08-extracts-string-values-from-array.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractSelectOptions(objLiteral, checker));
    expect(result).toBeDefined();
    expect(result!.values).toEqual(['option1', 'option2']);
  });

  test('extracts numeric values as literals', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/select/extract-options/09-extracts-numeric-values-as-literals.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractSelectOptions(objLiteral, checker));
    expect(result).toBeDefined();
    expect(result!.values).toEqual([1, 2]);
  });

  test('extracts boolean values as literals', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/select/extract-options/10-extracts-boolean-values-as-literals.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractSelectOptions(objLiteral, checker));
    expect(result).toBeDefined();
    expect(result!.values).toEqual([true, false]);
  });

  test('handles empty arrays', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/select/extract-options/11-handles-empty-arrays.ts')
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractSelectOptions(objLiteral, checker));
    expect(result).toBeDefined();
    expect(result!.values).toEqual([]);
    expect(result!.labels).toEqual({});
  });

  test('handles missing options property', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/select/extract-options/12-handles-missing-options-property.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractSelectOptions(objLiteral, checker));
    expect(result).toBeDefined();
    expect(result!.values).toEqual([]);
    expect(result!.labels).toEqual({});
  });

  test('handles invalid array elements', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/select/extract-options/13-handles-invalid-array-elements.ts')
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractSelectOptions(objLiteral, checker));
    expect(result).toBeDefined();
    expect(result!.values).toEqual(['valid']);
  });

  test('errors when every array element fails to resolve', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'array-error.ts',
      loadFixture(
        'core/ast/extractor/select/extract-options/14-errors-when-every-array-element-fails-to-resolve.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = extractSelectOptions(objLiteral, checker);
    expectResultError(result, "Missing 'value' property");
  });

  test('extracts shiki theme URLs from themeNames.map pattern (Vencord ShikiCodeblocks)', () => {
    const project = createProject();
    project.createSourceFile(
      'theme-data.ts',
      loadFixture('core/ast/extractor/select/extract-options/theme-data.ts')
    );
    const settingsFile = project.createSourceFile(
      'theme-settings.ts',
      loadFixture('core/ast/extractor/select/extract-options/theme-settings.ts')
    );
    project.resolveSourceFileDependencies();
    const evaluateSpy = vi
      .spyOn(resolve, 'evaluateThemesValues')
      .mockImplementation(() => [
        'https://raw.githubusercontent.com/Vendicated/Vencord/abcdef1234/packages/tm-themes/themes/DarkPlus.json',
        'https://themes.example/material.json',
      ]);
    const objLiteral = settingsFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractSelectOptions(objLiteral, checker));
    expect(result).toBeDefined();
    expect(result!.values).toEqual([
      'https://raw.githubusercontent.com/Vendicated/Vencord/abcdef1234/packages/tm-themes/themes/DarkPlus.json',
      'https://themes.example/material.json',
    ]);
    expect(evaluateSpy).toHaveBeenCalled();
    evaluateSpy.mockRestore();
  });

  test('falls back to theme keys when evaluateThemesValues returns empty', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'theme-fallback.ts',
      loadFixture(
        'core/ast/extractor/select/extract-options/17-falls-back-to-theme-keys-when-evaluate-themes-values-returns-empty.ts'
      )
    );
    const evaluateSpy = vi.spyOn(resolve, 'evaluateThemesValues').mockImplementation(() => []);
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractSelectOptions(objLiteral, checker));
    expect(result).toBeDefined();
    expect(result!.values).toEqual(['DarkPlus', 'LightPlus']);
    expect(evaluateSpy).toHaveBeenCalled();
    evaluateSpy.mockRestore();
  });

  test('falls back gracefully when theme names are produced by a factory call', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'theme-fallback.ts',
      loadFixture(
        'core/ast/extractor/select/extract-options/18-falls-back-gracefully-when-theme-names-are-produced-by-a-factory-call.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractSelectOptions(objLiteral, checker));
    expect(result).toBeDefined();
    expect(result!.values).toEqual([]);
  });

  test('returns empty when Object.values() argument is not an identifier', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'object-values.ts',
      loadFixture(
        'core/ast/extractor/select/extract-options/19-returns-empty-when-object-values-argument-is-not-an-identifier.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractSelectOptions(objLiteral, checker));
    expect(result).toBeDefined();
    expect(result!.values).toEqual([]);
  });

  test('returns empty when Array.from() argument cannot be statically resolved', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'array-from-set.ts',
      loadFixture(
        'core/ast/extractor/select/extract-options/20-returns-empty-when-array-from-argument-cannot-be-statically-resolved.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractSelectOptions(objLiteral, checker));
    expect(result).toBeDefined();
    expect(result!.values).toEqual([]);
  });

  test('errors when option objects omit the value property', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'missing-value.ts',
      loadFixture(
        'core/ast/extractor/select/extract-options/21-errors-when-option-objects-omit-the-value-property.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = extractSelectOptions(objLiteral, checker);
    expectResultError(result, "Missing 'value' property");
  });

  test('resolves Identifier referencing an external array', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'identifier-options.ts',
      loadFixture(
        'core/ast/extractor/select/extract-options/22-resolves-identifier-referencing-an-external-array.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractSelectOptions(objLiteral, checker));
    expect(result).toBeDefined();
    expect(result!.values).toEqual(['a', 'b']);
    expect(result!.labels).toEqual({ a: 'A', b: 'B' });
  });

  test('resolves Identifier referencing an external call expression', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'identifier-call.ts',
      loadFixture(
        'core/ast/extractor/select/extract-options/23-resolves-identifier-referencing-an-external-call-expression.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    // The identifier resolves to a CallExpression (.map), which should be handled
    const result = unwrapResult(extractSelectOptions(objLiteral, checker));
    expect(result).toBeDefined();
  });

  test('returns empty for unresolvable Identifier', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'unresolvable.ts',
      loadFixture(
        'core/ast/extractor/select/extract-options/24-returns-empty-for-unresolvable-identifier.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractSelectOptions(objLiteral, checker));
    expect(result).toBeDefined();
    expect(result!.values).toEqual([]);
  });

  test('records labels for boolean-valued options', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'boolean-labels.ts',
      loadFixture(
        'core/ast/extractor/select/extract-options/25-records-labels-for-boolean-valued-options.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractSelectOptions(objLiteral, checker));
    expect(result).toBeDefined();
    expect(result!.labels['true']).toBe('Enabled');
    expect(result!.labels['false']).toBe('Disabled');
    expect(result!.values).toEqual([true, false]);
  });
});
