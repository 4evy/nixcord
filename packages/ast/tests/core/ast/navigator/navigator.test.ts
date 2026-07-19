import { SyntaxKind } from 'ts-morph';
import { describe, expect, test } from 'vitest';
import {
  findAllPropertyAssignments,
  findNestedObjectLiterals,
  findPropertyAssignment,
} from '../../../../src/navigator/node-traversal.js';
import {
  findCallExpressionByName,
  findCallExpressionByNameUnwrappingChains,
  unwrapChainedCall,
} from '../../../../src/navigator/pattern-matcher.js';
import {
  findDefinePluginCall,
  findDefinePluginSettings,
} from '../../../../src/navigator/plugin-navigator.js';
import { createProject, loadFixture } from '../../../helpers/test-utils.js';

describe('node-traversal', () => {
  describe('findAllPropertyAssignments', () => {
    test('finds all property assignments in object literal', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        loadFixture(
          'core/ast/navigator/navigator/01-finds-all-property-assignments-in-object-literal.ts'
        )
      );
      const obj = sourceFile.getFirstDescendantByKind(SyntaxKind.ObjectLiteralExpression);
      if (!obj) throw new Error('Expected object literal');

      const props = findAllPropertyAssignments(obj);
      expect(props.length).toBe(3);
      expect(props[0]?.getNameNode().getText()).toBe('prop1');
      expect(props[1]?.getNameNode().getText()).toBe('prop2');
      expect(props[2]?.getNameNode().getText()).toBe('prop3');
    });

    test('returns empty array for empty object', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        loadFixture('core/ast/navigator/navigator/02-returns-empty-array-for-empty-object.ts')
      );
      const obj = sourceFile.getFirstDescendantByKind(SyntaxKind.ObjectLiteralExpression);
      if (!obj) throw new Error('Expected object literal');

      const props = findAllPropertyAssignments(obj);
      expect(props.length).toBe(0);
    });
  });

  describe('findPropertyAssignment', () => {
    test('finds property assignment by name', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        loadFixture('core/ast/navigator/navigator/03-finds-property-assignment-by-name.ts')
      );
      const obj = sourceFile.getFirstDescendantByKind(SyntaxKind.ObjectLiteralExpression);
      if (!obj) throw new Error('Expected object literal');

      const prop = findPropertyAssignment(obj, 'name');
      expect(prop).toBeDefined();
      expect(prop?.getNameNode().getText()).toBe('name');
    });

    test('returns undefined for non-existent property', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        loadFixture(
          'core/ast/navigator/navigator/04-returns-undefined-for-non-existent-property.ts'
        )
      );
      const obj = sourceFile.getFirstDescendantByKind(SyntaxKind.ObjectLiteralExpression);
      if (!obj) throw new Error('Expected object literal');

      const prop = findPropertyAssignment(obj, 'nonexistent');
      expect(prop).toBeUndefined();
    });
  });

  describe('findNestedObjectLiterals', () => {
    test('finds nested object literals', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        loadFixture('core/ast/navigator/navigator/05-finds-nested-object-literals.ts')
      );
      const obj = sourceFile.getFirstDescendantByKind(SyntaxKind.ObjectLiteralExpression);
      if (!obj) throw new Error('Expected object literal');

      const nested = Array.from(findNestedObjectLiterals(obj));
      expect(nested.length).toBeGreaterThan(1);
    });

    test('includes the root object literal', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        loadFixture('core/ast/navigator/navigator/06-includes-the-root-object-literal.ts')
      );
      const obj = sourceFile.getFirstDescendantByKind(SyntaxKind.ObjectLiteralExpression);
      if (!obj) throw new Error('Expected object literal');

      const nested = Array.from(findNestedObjectLiterals(obj));
      expect(nested.length).toBeGreaterThanOrEqual(1);
      expect(nested[0]).toBe(obj);
    });
  });
});

describe('pattern-matcher', () => {
  describe('findCallExpressionByName', () => {
    test('finds call expression by function name', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        loadFixture('core/ast/navigator/navigator/07-finds-call-expression-by-function-name.ts')
      );

      const result = findCallExpressionByName(sourceFile, 'myFunction');
      expect(result).toBeDefined();
      if (result !== undefined) {
        const expr = result.getExpression();
        expect(expr.getKind()).toBe(SyntaxKind.Identifier);
        expect(expr.getText()).toBe('myFunction');
      }
    });

    test('returns nothing for non-existent function', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        loadFixture('core/ast/navigator/navigator/08-returns-nothing-for-non-existent-function.ts')
      );

      const result = findCallExpressionByName(sourceFile, 'nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('unwrapChainedCall', () => {
    test('unwraps chained method calls', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        loadFixture('core/ast/navigator/navigator/09-unwraps-chained-method-calls.ts')
      );
      const callExpr = sourceFile.getFirstDescendantByKind(SyntaxKind.CallExpression);
      if (!callExpr) throw new Error('Expected call expression');

      const unwrapped = unwrapChainedCall(callExpr, ['chainMethod1', 'chainMethod2']);
      const expr = unwrapped.getExpression();
      expect(expr.getText()).toBe('original');
    });

    test('returns original call if no chain found', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        loadFixture('core/ast/navigator/navigator/10-returns-original-call-if-no-chain-found.ts')
      );
      const callExpr = sourceFile.getFirstDescendantByKind(SyntaxKind.CallExpression);
      if (!callExpr) throw new Error('Expected call expression');

      const unwrapped = unwrapChainedCall(callExpr, ['chainMethod']);
      expect(unwrapped).toBe(callExpr);
    });
  });

  describe('findCallExpressionByNameUnwrappingChains', () => {
    test('finds call expression and unwraps chains', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        loadFixture('core/ast/navigator/navigator/11-finds-call-expression-and-unwraps-chains.ts')
      );

      const result = findCallExpressionByNameUnwrappingChains(sourceFile, 'original', [
        'withPrivateSettings',
      ]);
      expect(result).toBeDefined();
      if (result !== undefined) {
        const expr = result.getExpression();
        expect(expr.getText()).toBe('original');
      }
    });
  });
});

describe('plugin-navigator', () => {
  describe('findDefinePluginCall', () => {
    test('finds definePlugin call', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        loadFixture('core/ast/navigator/navigator/12-finds-define-plugin-call.ts')
      );

      const result = findDefinePluginCall(sourceFile);
      expect(result).toBeDefined();
    });

    test('returns nothing when definePlugin not found', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        loadFixture(
          'core/ast/navigator/navigator/13-returns-nothing-when-define-plugin-not-found.ts'
        )
      );

      const result = findDefinePluginCall(sourceFile);
      expect(result).toBeUndefined();
    });
  });

  describe('findDefinePluginSettings', () => {
    test('finds definePluginSettings call', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        loadFixture('core/ast/navigator/navigator/14-finds-define-plugin-settings-call.ts')
      );

      const result = findDefinePluginSettings(sourceFile);
      expect(result).toBeDefined();
    });

    test('unwraps chained withPrivateSettings call', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        loadFixture('core/ast/navigator/navigator/15-unwraps-chained-with-private-settings-call.ts')
      );

      const result = findDefinePluginSettings(sourceFile);
      expect(result).toBeDefined();
      if (result !== undefined) {
        const expr = result.getExpression();
        expect(expr.getText()).toBe('definePluginSettings');
      }
    });
  });
});
