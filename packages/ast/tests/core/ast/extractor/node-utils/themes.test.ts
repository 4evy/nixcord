import { describe, expect, test } from 'vitest';
import { evaluateThemesValues } from '../../../../../src/foundation/index.js';
import { createProject, loadFixture } from '../../../../helpers/test-utils.js';

describe('evaluateThemesValues()', () => {
  test('evaluates simple theme object with string literals', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/node-utils/themes/01-evaluates-simple-theme-object-with-string-literals.ts'
      )
    );
    const varDecl = sourceFile.getVariableDeclarationOrThrow('themes');
    const identifier = varDecl.getNameNode();
    const checker = project.getTypeChecker();
    const values = evaluateThemesValues(identifier, checker);
    expect(values).toEqual(['dark-plus', 'light-plus']);
  });

  test('evaluates theme object with shikiRepoTheme calls', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/node-utils/themes/02-evaluates-theme-object-with-shiki-repo-theme-calls.ts'
      )
    );
    const varDecl = sourceFile.getVariableDeclarationOrThrow('themes');
    const identifier = varDecl.getNameNode();
    const checker = project.getTypeChecker();
    const values = evaluateThemesValues(identifier, checker);
    expect(values.length).toBeGreaterThan(0);
    expect(values[0]).toContain('raw.githubusercontent.com');
    expect(values[0]).toContain('dark-plus');
  });

  test('returns empty array for non-identifier', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/node-utils/themes/03-returns-empty-array-for-non-identifier.ts'
      )
    );
    const varDecl = sourceFile.getVariableDeclarationOrThrow('x');
    const initializer = varDecl.getInitializer();
    if (initializer) {
      const checker = project.getTypeChecker();
      const values = evaluateThemesValues(initializer, checker);
      expect(values).toEqual([]);
    }
  });

  test('returns empty array for non-object literal', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/node-utils/themes/04-returns-empty-array-for-non-object-literal.ts'
      )
    );
    const varDecl = sourceFile.getVariableDeclarationOrThrow('themes');
    const identifier = varDecl.getNameNode();
    const checker = project.getTypeChecker();
    const values = evaluateThemesValues(identifier, checker);
    expect(values).toEqual([]);
  });

  test('filters out null values', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/extractor/node-utils/themes/05-filters-out-null-values.ts')
    );
    const varDecl = sourceFile.getVariableDeclarationOrThrow('themes');
    const identifier = varDecl.getNameNode();
    const checker = project.getTypeChecker();
    const values = evaluateThemesValues(identifier, checker);
    expect(values).toEqual(['valid', 'also-valid']);
  });
});
