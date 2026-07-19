import { describe, expect, test } from 'vitest';
import { resolveEnumLikeValue } from '../../../../src/extractor/enum-resolver.js';
import { createProject, loadFixture } from '../../../helpers/test-utils.js';

function unwrapResult<T>(result: {
  ok: boolean;
  value?: T;
  error?: { message: string };
}): T | null {
  if (result.ok) return result.value ?? null;
  return null;
}

describe('resolveEnumLikeValue()', () => {
  test('resolves string literal', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/enum-resolver/01-resolves-string-literal.ts')
    );
    const varDecl = sourceFile.getVariableDeclarationOrThrow('x');
    const initializer = varDecl.getInitializerOrThrow();
    const checker = project.getTypeChecker();
    const resolved = unwrapResult(resolveEnumLikeValue(initializer, checker));
    expect(resolved).toBe('test');
  });

  test('resolves numeric literal', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/enum-resolver/02-resolves-numeric-literal.ts')
    );
    const varDecl = sourceFile.getVariableDeclarationOrThrow('x');
    const initializer = varDecl.getInitializerOrThrow();
    const checker = project.getTypeChecker();
    const resolved = unwrapResult(resolveEnumLikeValue(initializer, checker));
    expect(resolved).toBe(42);
  });

  test('resolves true keyword', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/enum-resolver/03-resolves-true-keyword.ts')
    );
    const varDecl = sourceFile.getVariableDeclarationOrThrow('x');
    const initializer = varDecl.getInitializerOrThrow();
    const checker = project.getTypeChecker();
    const resolved = unwrapResult(resolveEnumLikeValue(initializer, checker));
    expect(resolved).toBe(true);
  });

  test('resolves false keyword', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/enum-resolver/04-resolves-false-keyword.ts')
    );
    const varDecl = sourceFile.getVariableDeclarationOrThrow('x');
    const initializer = varDecl.getInitializerOrThrow();
    const checker = project.getTypeChecker();
    const resolved = unwrapResult(resolveEnumLikeValue(initializer, checker));
    expect(resolved).toBe(false);
  });

  test('unwraps AsExpression', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/enum-resolver/05-unwraps-as-expression.ts')
    );
    const varDecl = sourceFile.getVariableDeclarationOrThrow('x');
    const initializer = varDecl.getInitializerOrThrow();
    const checker = project.getTypeChecker();
    const resolved = unwrapResult(resolveEnumLikeValue(initializer, checker));
    expect(resolved).toBe('test');
  });

  test('unwraps TypeAssertionExpression', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/enum-resolver/06-unwraps-type-assertion-expression.ts')
    );
    const varDecl = sourceFile.getVariableDeclarationOrThrow('x');
    const initializer = varDecl.getInitializerOrThrow();
    const checker = project.getTypeChecker();
    const resolved = unwrapResult(resolveEnumLikeValue(initializer, checker));
    expect(resolved).toBe('test');
  });

  test('unwraps ParenthesizedExpression', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/enum-resolver/07-unwraps-parenthesized-expression.ts')
    );
    const varDecl = sourceFile.getVariableDeclarationOrThrow('x');
    const initializer = varDecl.getInitializerOrThrow();
    const checker = project.getTypeChecker();
    const resolved = unwrapResult(resolveEnumLikeValue(initializer, checker));
    expect(resolved).toBe(42);
  });

  test('resolves enum member', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/enum-resolver/08-resolves-enum-member.ts')
    );
    const varDecl = sourceFile.getVariableDeclarationOrThrow('x');
    const initializer = varDecl.getInitializerOrThrow();
    const checker = project.getTypeChecker();
    const resolved = unwrapResult(resolveEnumLikeValue(initializer, checker));
    expect(resolved).toBe('test');
  });

  test('resolves numeric enum member', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/enum-resolver/09-resolves-numeric-enum-member.ts')
    );
    const varDecl = sourceFile.getVariableDeclarationOrThrow('x');
    const initializer = varDecl.getInitializerOrThrow();
    const checker = project.getTypeChecker();
    const resolved = unwrapResult(resolveEnumLikeValue(initializer, checker));
    expect(resolved).toBe(42);
  });

  test('resolves object literal property access', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/enum-resolver/10-resolves-object-literal-property-access.ts')
    );
    const varDecl = sourceFile.getVariableDeclarationOrThrow('x');
    const initializer = varDecl.getInitializerOrThrow();
    const checker = project.getTypeChecker();
    const resolved = unwrapResult(resolveEnumLikeValue(initializer, checker));
    expect(resolved).toBe('dark-plus');
  });

  test('resolves object literal property access with as const', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/enum-resolver/11-resolves-object-literal-property-access-with-as-const.ts'
      )
    );
    const varDecl = sourceFile.getVariableDeclarationOrThrow('x');
    const initializer = varDecl.getInitializerOrThrow();
    const checker = project.getTypeChecker();
    const resolved = unwrapResult(resolveEnumLikeValue(initializer, checker));
    expect(resolved).toBe('dark-plus');
  });

  test('resolves ActivityType enum fallback', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/enum-resolver/12-resolves-activity-type-enum-fallback.ts')
    );
    const varDecl = sourceFile.getVariableDeclarationOrThrow('x');
    const initializer = varDecl.getInitializerOrThrow();
    const checker = project.getTypeChecker();
    const resolved = unwrapResult(resolveEnumLikeValue(initializer, checker));
    expect(resolved).toBe(0);
  });

  test('resolves ActivityType.STREAMING', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/enum-resolver/13-resolves-activity-type-streaming.ts')
    );
    const varDecl = sourceFile.getVariableDeclarationOrThrow('x');
    const initializer = varDecl.getInitializerOrThrow();
    const checker = project.getTypeChecker();
    const resolved = unwrapResult(resolveEnumLikeValue(initializer, checker));
    expect(resolved).toBe(1);
  });

  test('resolves ActivityType.HANG_STATUS fallback', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/enum-resolver/14-resolves-activity-type-hang-status-fallback.ts'
      )
    );
    const varDecl = sourceFile.getVariableDeclarationOrThrow('x');
    const initializer = varDecl.getInitializerOrThrow();
    const checker = project.getTypeChecker();
    const resolved = unwrapResult(resolveEnumLikeValue(initializer, checker));
    expect(resolved).toBe(6);
  });

  test('returns null for unresolved property access', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/enum-resolver/15-returns-null-for-unresolved-property-access.ts'
      )
    );
    const varDecl = sourceFile.getVariableDeclarationOrThrow('x');
    const initializer = varDecl.getInitializerOrThrow();
    const checker = project.getTypeChecker();
    const resolved = unwrapResult(resolveEnumLikeValue(initializer, checker));
    expect(resolved).toBeNull();
  });

  test('returns null for unsupported node kind', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/enum-resolver/16-returns-null-for-unsupported-node-kind.ts')
    );
    const varDecl = sourceFile.getVariableDeclarationOrThrow('x');
    const initializer = varDecl.getInitializerOrThrow();
    const checker = project.getTypeChecker();
    const resolved = unwrapResult(resolveEnumLikeValue(initializer, checker));
    expect(resolved).toBeNull();
  });

  test('resolves numeric enum with as const', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/enum-resolver/17-resolves-numeric-enum-with-as-const.ts')
    );
    const varDecl = sourceFile.getVariableDeclarationOrThrow('x');
    const initializer = varDecl.getInitializerOrThrow();
    const checker = project.getTypeChecker();
    const resolved = unwrapResult(resolveEnumLikeValue(initializer, checker));
    expect(resolved).toBe(0);
  });

  test('resolves boolean enum member', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/enum-resolver/18-resolves-boolean-enum-member.ts')
    );
    const varDecl = sourceFile.getVariableDeclarationOrThrow('x');
    const initializer = varDecl.getInitializerOrThrow();
    const checker = project.getTypeChecker();
    const resolved = unwrapResult(resolveEnumLikeValue(initializer, checker));
    expect(resolved).toBe(true);
  });

  test('handles multiple type assertions', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/enum-resolver/19-handles-multiple-type-assertions.ts')
    );
    const varDecl = sourceFile.getVariableDeclarationOrThrow('x');
    const initializer = varDecl.getInitializerOrThrow();
    const checker = project.getTypeChecker();
    const resolved = unwrapResult(resolveEnumLikeValue(initializer, checker));
    expect(resolved).toBe('test');
  });

  test('resolves simple template literal', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/enum-resolver/20-resolves-simple-template-literal.ts')
    );
    const varDecl = sourceFile.getVariableDeclarationOrThrow('x');
    const initializer = varDecl.getInitializerOrThrow();
    const checker = project.getTypeChecker();
    const resolved = unwrapResult(resolveEnumLikeValue(initializer, checker));
    expect(resolved).toBe('template-value');
  });

  test('returns error for template expression with substitutions', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/enum-resolver/21-returns-error-for-template-expression-with-substitutions.ts'
      )
    );
    const varDecl = sourceFile.getVariableDeclarationOrThrow('x');
    const initializer = varDecl.getInitializerOrThrow();
    const checker = project.getTypeChecker();
    const result = resolveEnumLikeValue(initializer, checker);
    // Template expressions with substitutions should return an error
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('CannotEvaluate');
    }
  });

  test('handles property access with same-file lookup fallback', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/enum-resolver/22-handles-property-access-with-same-file-lookup-fallback.ts'
      )
    );
    const varDecl = sourceFile.getVariableDeclarationOrThrow('x');
    const initializer = varDecl.getInitializerOrThrow();
    const checker = project.getTypeChecker();
    const resolved = unwrapResult(resolveEnumLikeValue(initializer, checker));
    // Should resolve via same-file lookup fallback
    expect(resolved).toBe('dark-plus');
  });

  test('handles enum member with getValue() fallback', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/enum-resolver/23-handles-enum-member-with-get-value-fallback.ts'
      )
    );
    const varDecl = sourceFile.getVariableDeclarationOrThrow('x');
    const initializer = varDecl.getInitializerOrThrow();
    const checker = project.getTypeChecker();
    const resolved = unwrapResult(resolveEnumLikeValue(initializer, checker));
    // Should resolve via getValue() or initializer
    expect(resolved).toBe('test-value');
  });

  test('handles enum member with numeric initializer', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/enum-resolver/24-handles-enum-member-with-numeric-initializer.ts'
      )
    );
    const varDecl = sourceFile.getVariableDeclarationOrThrow('x');
    const initializer = varDecl.getInitializerOrThrow();
    const checker = project.getTypeChecker();
    const resolved = unwrapResult(resolveEnumLikeValue(initializer, checker));
    // Should resolve via initializer when getValue() fails
    expect(resolved).toBe(123);
  });

  test('resolves bitwise OR operation', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/enum-resolver/26-resolves-bitwise-or-operation.ts')
    );
    const varDecl = sourceFile.getVariableDeclarationOrThrow('x');
    const initializer = varDecl.getInitializerOrThrow();
    const checker = project.getTypeChecker();
    const resolved = unwrapResult(resolveEnumLikeValue(initializer, checker));
    expect(resolved).toBe(3);
  });

  test('resolves bitwise shift operation', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/enum-resolver/27-resolves-bitwise-shift-operation.ts')
    );
    const varDecl = sourceFile.getVariableDeclarationOrThrow('x');
    const initializer = varDecl.getInitializerOrThrow();
    const checker = project.getTypeChecker();
    const resolved = unwrapResult(resolveEnumLikeValue(initializer, checker));
    expect(resolved).toBe(2);
  });

  test('resolves enum member with bitwise shift initializer', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/enum-resolver/28-resolves-enum-member-with-bitwise-shift-initializer.ts'
      )
    );
    const varDecl = sourceFile.getVariableDeclarationOrThrow('x');
    const initializer = varDecl.getInitializerOrThrow();
    const checker = project.getTypeChecker();
    const resolved = unwrapResult(resolveEnumLikeValue(initializer, checker));
    expect(resolved).toBe(1);
  });

  test('resolves bitwise OR of enum members', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/enum-resolver/29-resolves-bitwise-or-of-enum-members.ts')
    );
    const varDecl = sourceFile.getVariableDeclarationOrThrow('x');
    const initializer = varDecl.getInitializerOrThrow();
    const checker = project.getTypeChecker();
    const resolved = unwrapResult(resolveEnumLikeValue(initializer, checker));
    expect(resolved).toBe(3);
  });
});
