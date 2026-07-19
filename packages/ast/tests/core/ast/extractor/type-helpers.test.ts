import { SyntaxKind } from 'ts-morph';
import { describe, expect, test } from 'vitest';
import {
  getDefaultPropertyInitializer,
  isCustomType,
} from '../../../../src/extractor/type-helpers.js';
import {
  createProject,
  createSettingProperties,
  loadFixture,
} from '../../../helpers/test-utils.js';

describe('type-helpers', () => {
  describe('getDefaultPropertyInitializer', () => {
    test('returns default property initializer when exists', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        loadFixture(
          'core/ast/extractor/type-helpers/01-returns-default-property-initializer-when-exists.ts'
        )
      );
      const obj = sourceFile.getFirstDescendantByKind(SyntaxKind.ObjectLiteralExpression);
      if (!obj) throw new Error('Expected object literal');

      const init = getDefaultPropertyInitializer(obj);
      expect(init).toBeDefined();
      expect(init?.getKind()).toBe(SyntaxKind.StringLiteral);
    });

    test('returns undefined when default property does not exist', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        loadFixture(
          'core/ast/extractor/type-helpers/02-returns-undefined-when-default-property-does-not-exist.ts'
        )
      );
      const obj = sourceFile.getFirstDescendantByKind(SyntaxKind.ObjectLiteralExpression);
      if (!obj) throw new Error('Expected object literal');

      const init = getDefaultPropertyInitializer(obj);
      expect(init).toBeUndefined();
    });
  });

  describe('isCustomType', () => {
    test('returns true for CUSTOM type property', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        loadFixture('core/ast/extractor/type-helpers/03-returns-true-for-custom-type-property.ts')
      );
      const obj = sourceFile.getFirstDescendantByKind(SyntaxKind.ObjectLiteralExpression);
      if (!obj) throw new Error('Expected object literal');

      const typeProp = obj.getProperty('type');
      const typeNode =
        typeProp?.getKind() === SyntaxKind.PropertyAssignment
          ? typeProp.asKindOrThrow(SyntaxKind.PropertyAssignment).getInitializer()
          : undefined;

      const props = createSettingProperties({ typeNode });
      const result = isCustomType(obj, props);
      expect(result).toBe(true);
    });

    test('returns false for non-CUSTOM type', () => {
      const project = createProject();
      const sourceFile = project.createSourceFile(
        'test.ts',
        loadFixture('core/ast/extractor/type-helpers/04-returns-false-for-non-custom-type.ts')
      );
      const obj = sourceFile.getFirstDescendantByKind(SyntaxKind.ObjectLiteralExpression);
      if (!obj) throw new Error('Expected object literal');

      const props = createSettingProperties();
      const result = isCustomType(obj, props);
      expect(result).toBe(false);
    });
  });
});
