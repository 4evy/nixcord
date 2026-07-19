import { SyntaxKind } from 'ts-morph';
import { describe, expect, test } from 'vitest';
import {
  extractSelectDefault,
  extractSelectOptions,
} from '../../../../../src/extractor/select/index.js';
import { createProject, loadFixture, unwrapResult } from '../../../../helpers/test-utils.js';

describe('extractSelectDefault()', () => {
  test('extracts default from options with default: true', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/select/extract-default/01-extracts-default-from-options-with-default-true.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractSelectDefault(objLiteral, checker));
    expect(result).toBe('second');
  });

  test('extracts numeric default values', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/select/extract-default/02-extracts-numeric-default-values.ts')
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractSelectDefault(objLiteral, checker));
    expect(result).toBe(0);
  });

  test('returns undefined when no default is present', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/select/extract-default/03-returns-undefined-when-no-default-is-present.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractSelectDefault(objLiteral, checker));
    expect(result).toBeUndefined();
  });

  test('extracts default from Object.keys().map() pattern', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/select/extract-default/04-extracts-default-from-object-keys-map-pattern.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractSelectDefault(objLiteral, checker));
    expect(result).toBe('Random');
  });

  test('extracts default with boolean enum (2 boolean values)', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/select/extract-default/05-extracts-default-with-boolean-enum-2-boolean-values.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractSelectDefault(objLiteral, checker));
    expect(result).toBe(true);
  });

  test('extracts default from binary expression inside array.map callback', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'binary-default.ts',
      loadFixture(
        'core/ast/extractor/select/extract-default/06-extracts-default-from-binary-expression-inside-array-map-callback.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractSelectDefault(objLiteral, checker));
    expect(result).toBe('1024');
  });

  test('returns undefined when a non-map call is used for options', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'filter-default.ts',
      loadFixture(
        'core/ast/extractor/select/extract-default/07-returns-undefined-when-a-non-map-call-is-used-for-options.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = extractSelectDefault(objLiteral, checker);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected successful result');
    }
    expect(result.value).toBeUndefined();
  });

  // Array.from() without arguments throws before we can analyze it, so we skip testing that branch

  test('extracts first option when defaults cannot be inferred', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'view-icons.ts',
      loadFixture(
        'core/ast/extractor/select/extract-default/08-extracts-first-option-when-defaults-cannot-be-inferred.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractSelectDefault(objLiteral, checker));
    expect(result).toBe('1024');
  });

  test('extracts default from identifier.map equality check (format selector)', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'identifier-map.ts',
      loadFixture(
        'core/ast/extractor/select/extract-default/09-extracts-default-from-identifier-map-equality-check-format-selector.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractSelectDefault(objLiteral, checker));
    expect(result).toBe('png');
  });

  test('falls back to the first literal when map default expression is not comparable', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'map-fallback.ts',
      loadFixture(
        'core/ast/extractor/select/extract-default/10-falls-back-to-the-first-literal-when-map-default-expression-is-not-com.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractSelectDefault(objLiteral, checker));
    expect(result).toBe('Mini');
  });

  test('detects defaults inside spread arrays', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'spread-default.ts',
      loadFixture(
        'core/ast/extractor/select/extract-default/11-detects-defaults-inside-spread-arrays.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractSelectDefault(objLiteral, checker));
    expect(result).toBe('base');
  });

  test('extracts values via Object.values().map pattern', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'object-values-success.ts',
      loadFixture(
        'core/ast/extractor/select/extract-default/12-extracts-values-via-object-values-map-pattern.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractSelectOptions(objLiteral, checker));
    expect(result).toBeDefined();
    expect(result!.values).toEqual(['lowercase', 'capitalized']);
  });

  test('merges spread arrays when extracting options', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'spread-options.ts',
      loadFixture(
        'core/ast/extractor/select/extract-default/13-merges-spread-arrays-when-extracting-options.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractSelectOptions(objLiteral, checker));
    expect(result).toBeDefined();
    expect(result!.values).toEqual(['base', 'extra']);
    expect(result!.labels).toEqual({ base: 'Base', extra: 'Extra' });
  });

  test('gracefully returns empty results when using .filter instead of .map', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'filter-pattern.ts',
      loadFixture(
        'core/ast/extractor/select/extract-default/14-gracefully-returns-empty-results-when-using-filter-instead-of-map.ts'
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
});
