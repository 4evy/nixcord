import { SyntaxKind } from 'ts-morph';
import { describe, expect, test } from 'vitest';
import {
  hasEmptyArrayWithTypeAnnotation,
  hasObjectArrayDefault,
  hasStringArrayDefault,
  resolveIdentifierArrayDefault,
} from '../../../../src/extractor/default-value-checks/index.js';
import { createProject, loadFixture } from '../../../helpers/test-utils.js';

let fileId = 0;

function getOptionLiteral(code: string, varName = 'option') {
  const project = createProject();
  const sourceFile = project.createSourceFile(`default-value-checks-${fileId++}.ts`, code, {
    overwrite: true,
  });
  const literal = sourceFile
    .getVariableDeclarationOrThrow(varName)
    .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
  const checker = project.getTypeChecker();
  return { literal, checker };
}

describe('default value structural helpers', () => {
  test('hasStringArrayDefault detects inline literals and identifiers', () => {
    const source = loadFixture('core/ast/extractor/default-value-checks/string-array-defaults.ts');
    const inline = getOptionLiteral(source, 'inline').literal;
    expect(hasStringArrayDefault(inline)).toBe(true);

    const identifier = getOptionLiteral(source, 'identifier').literal;
    expect(hasStringArrayDefault(identifier)).toBe(true);

    const notStringArray = getOptionLiteral(source, 'notStringArray').literal;
    expect(hasStringArrayDefault(notStringArray)).toBe(false);
  });

  test('hasObjectArrayDefault handles call expressions and identifier resolution', () => {
    const source = loadFixture('core/ast/extractor/default-value-checks/object-array-defaults.ts');
    const fromCallResult = getOptionLiteral(source, 'fromCall');
    expect(hasObjectArrayDefault(fromCallResult.literal, fromCallResult.checker)).toBe(true);

    const fromIdentifierResult = getOptionLiteral(source, 'fromIdentifier');
    expect(hasObjectArrayDefault(fromIdentifierResult.literal, fromIdentifierResult.checker)).toBe(
      true
    );

    const notObjectsResult = getOptionLiteral(source, 'notObjects');
    expect(hasObjectArrayDefault(notObjectsResult.literal, notObjectsResult.checker)).toBe(false);
  });

  test('hasEmptyArrayWithTypeAnnotation recognises typed arrays and helper factories', () => {
    const source = loadFixture('core/ast/extractor/default-value-checks/empty-array-defaults.ts');
    const typed = getOptionLiteral(source, 'typed').literal;
    expect(hasEmptyArrayWithTypeAnnotation(typed)).toBe(true);

    const fromFactory = getOptionLiteral(source, 'fromFactory').literal;
    expect(hasEmptyArrayWithTypeAnnotation(fromFactory)).toBe(true);

    const withoutAnnotation = getOptionLiteral(source, 'withoutAnnotation').literal;
    expect(hasEmptyArrayWithTypeAnnotation(withoutAnnotation)).toBe(false);
  });

  test('resolveIdentifierArrayDefault inspects literals and casts', () => {
    const source = loadFixture(
      'core/ast/extractor/default-value-checks/identifier-array-defaults.ts'
    );
    const literal = getOptionLiteral(source, 'literal').literal;
    expect(resolveIdentifierArrayDefault(literal)).toBe(true);

    const cast = getOptionLiteral(source, 'cast').literal;
    expect(resolveIdentifierArrayDefault(cast)).toBe(true);

    const invalid = getOptionLiteral(source, 'invalid').literal;
    expect(resolveIdentifierArrayDefault(invalid)).toBe(false);
  }, 40000);
});
