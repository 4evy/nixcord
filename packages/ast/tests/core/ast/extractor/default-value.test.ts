import { SyntaxKind } from 'ts-morph';
import { describe, expect, test } from 'vitest';
import { extractDefaultValue } from '../../../../src/extractor/default-value.js';
import { createProject, loadFixture, unwrapResult } from '../../../helpers/test-utils.js';

describe('extractDefaultValue()', () => {
  test('BigInt literal -> integer string', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/default-value/01-big-int-literal-integer-string.ts')
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractDefaultValue(objLiteral, checker));
    expect(result).toBe('1026532993923293184');
  });

  test('identifier default resolving to array/object', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/default-value/02-identifier-default-resolving-to-array-object.ts'
      )
    );
    const arrLiteral = sourceFile
      .getVariableDeclarationOrThrow('arr')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const arrResult = unwrapResult(extractDefaultValue(arrLiteral, checker));
    const objResult = unwrapResult(extractDefaultValue(objLiteral, checker));
    // For identifier-resolved literals we return shape-only defaults
    expect(arrResult).toEqual([]);
    expect(objResult).toEqual({});
  });
  test('string literals', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/default-value/03-string-literals.ts')
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractDefaultValue(objLiteral, checker));
    expect(result).toBe('test-value');
  });

  test('numeric literals (integers)', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/default-value/04-numeric-literals-integers.ts')
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractDefaultValue(objLiteral, checker));
    expect(result).toBe(42);
  });

  test('numeric literals (floats)', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/default-value/05-numeric-literals-floats.ts')
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractDefaultValue(objLiteral, checker));
    expect(result).toBe(3.14);
  });

  test('boolean true', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/default-value/06-boolean-true.ts')
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractDefaultValue(objLiteral, checker));
    expect(result).toBe(true);
  });

  test('boolean false', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/default-value/07-boolean-false.ts')
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractDefaultValue(objLiteral, checker));
    expect(result).toBe(false);
  });

  test('null keyword', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/default-value/08-null-keyword.ts')
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractDefaultValue(objLiteral, checker));
    expect(result).toBe(null);
  });

  test('undefined keyword', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/default-value/09-undefined-keyword.ts')
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractDefaultValue(objLiteral, checker));
    // undefined keyword should be converted to null
    expect(result).toBe(null);
  });

  test('array literals []', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/default-value/10-array-literals.ts')
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractDefaultValue(objLiteral, checker));
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([]);
  });

  test('object literals {}', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/default-value/11-object-literals.ts')
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractDefaultValue(objLiteral, checker));
    expect(result).toEqual({});
  });

  test('property access expressions (ignored)', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/default-value/12-property-access-expressions-ignored.ts')
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractDefaultValue(objLiteral, checker));
    expect(result).toBe(undefined);
  });

  test('get() function calls (return undefined)', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/default-value/13-get-function-calls-return-undefined.ts')
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractDefaultValue(objLiteral, checker));
    expect(result).toBe(undefined);
  });

  test('computed defaults with getters (return undefined)', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/default-value/14-computed-defaults-with-getters-return-undefined.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractDefaultValue(objLiteral, checker));
    // Getters cannot be evaluated statically, so should return undefined
    expect(result).toBe(undefined);
  });

  test('handles missing default property', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/default-value/15-handles-missing-default-property.ts')
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractDefaultValue(objLiteral, checker));
    expect(result).toBe(undefined);
  });

  test('handles nested object literal in function call', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/default-value/16-handles-nested-object-literal-in-function-call.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractDefaultValue(objLiteral, checker));
    expect(result).toEqual({ a: 1, b: 'two' });
  });

  test('handles complex nested type assertion', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/default-value/17-handles-complex-nested-type-assertion.ts')
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractDefaultValue(objLiteral, checker));
    expect(result).toBe('test');
  });

  test('handles identifier resolving to undefined keyword', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/default-value/18-handles-identifier-resolving-to-undefined-keyword.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractDefaultValue(objLiteral, checker));
    expect(result).toBe(null);
  });

  test('handles property access with as const', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/default-value/19-handles-property-access-with-as-const.ts')
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractDefaultValue(objLiteral, checker));
    expect(result).toBe(0);
  });

  test('handles function call returning object literal', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/default-value/20-handles-function-call-returning-object-literal.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractDefaultValue(objLiteral, checker));
    expect(result).toEqual({});
  });

  test('handles function call returning array literal', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/default-value/21-handles-function-call-returning-array-literal.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractDefaultValue(objLiteral, checker));
    // Should extract shape-only default (array)
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([]);
  });

  test('handles simple template literal without substitutions', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/default-value/22-handles-simple-template-literal-without-substitutions.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractDefaultValue(objLiteral, checker));
    expect(result).toBe('simple-template');
  });

  test('handles template expression with substitutions (returns undefined)', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/default-value/23-handles-template-expression-with-substitutions-returns-undefined.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractDefaultValue(objLiteral, checker));
    // Template expressions with substitutions can't be statically evaluated
    expect(result).toBe(undefined);
  });

  test('handles template literal in as expression', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/default-value/24-handles-template-literal-in-as-expression.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractDefaultValue(objLiteral, checker));
    expect(result).toBe('template');
  });

  test('handles function call with object literal containing computed property names', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/default-value/25-handles-function-call-with-object-literal-containing-computed-property.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractDefaultValue(objLiteral, checker));
    // Computed property names should be skipped (key will be undefined)
    expect(result).toEqual({});
  });

  test('handles function call with object literal containing unsupported property types', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/default-value/26-handles-function-call-with-object-literal-containing-unsupported-prope.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractDefaultValue(objLiteral, checker));
    // Arrow function initializers should result in undefined value, which gets skipped
    expect(result).toEqual({});
  });

  test('handles function call returning non-array/non-object literal', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/default-value/27-handles-function-call-returning-non-array-non-object-literal.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractDefaultValue(objLiteral, checker));
    // When function call resolves to non-array/non-object, should return undefined
    expect(result).toBe(undefined);
  });

  test('handles function call with no arguments', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/default-value/28-handles-function-call-with-no-arguments.ts')
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractDefaultValue(objLiteral, checker));
    expect(result).toEqual({});
  });

  test('handles identifier resolving to unexpected node kind', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/default-value/29-handles-identifier-resolving-to-unexpected-node-kind.ts'
      )
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const checker = project.getTypeChecker();
    const result = unwrapResult(extractDefaultValue(objLiteral, checker));
    // Identifier resolving to function should result in undefined via otherwise path
    expect(result).toBe(undefined);
  });
});
