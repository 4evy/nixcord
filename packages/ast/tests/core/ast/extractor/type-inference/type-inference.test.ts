import { SyntaxKind } from 'ts-morph';
import { describe, expect, test } from 'vitest';
import { inferNixTypeAndEnumValues } from '../../../../../src/extractor/type-inference/index.js';
import {
  createProject,
  createSettingProperties,
  loadFixture,
} from '../../../../helpers/test-utils.js';

describe('inferNixTypeAndEnumValues', () => {
  test('infers string type from TypeScript string type', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/type-inference/type-inference/01-infers-string-type-from-type-script-string-type.ts'
      )
    );
    const obj = sourceFile.getFirstDescendantByKind(SyntaxKind.ObjectLiteralExpression);
    if (!obj) throw new Error('Expected object literal');

    const props = createSettingProperties({ defaultLiteralValue: 'hello' });
    const result = inferNixTypeAndEnumValues(
      obj,
      props,
      {
        type: undefined,
        description: undefined,
        default: 'hello',
        restartNeeded: false,
        hidden: false,
      },
      project.getTypeChecker(),
      project.getProgram()
    );

    expect(result.finalNixType).toBe('types.str');
    expect(result.defaultValue).toBe('hello');
  });

  test('infers boolean type from TypeScript boolean type', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/type-inference/type-inference/02-infers-boolean-type-from-type-script-boolean-type.ts'
      )
    );
    const obj = sourceFile.getFirstDescendantByKind(SyntaxKind.ObjectLiteralExpression);
    if (!obj) throw new Error('Expected object literal');

    const props = createSettingProperties({ defaultLiteralValue: true });
    const result = inferNixTypeAndEnumValues(
      obj,
      props,
      {
        type: undefined,
        description: undefined,
        default: true,
        restartNeeded: false,
        hidden: false,
      },
      project.getTypeChecker(),
      project.getProgram()
    );

    expect(result.finalNixType).toBe('types.bool');
    expect(result.defaultValue).toBe(true);
  });

  test('infers enum type from options array', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/type-inference/type-inference/03-infers-enum-type-from-options-array.ts'
      )
    );
    const obj = sourceFile.getFirstDescendantByKind(SyntaxKind.ObjectLiteralExpression);
    if (!obj) throw new Error('Expected object literal');

    const props = createSettingProperties();
    const result = inferNixTypeAndEnumValues(
      obj,
      props,
      {
        type: undefined,
        description: undefined,
        default: undefined,
        restartNeeded: false,
        hidden: false,
        options: ['option1', 'option2'],
      },
      project.getTypeChecker(),
      project.getProgram()
    );

    expect(result.finalNixType).toBe('types.enum');
    expect(result.selectEnumValues).toEqual(['option1', 'option2']);
  });

  test('infers listOf str from string array default', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/type-inference/type-inference/04-infers-list-of-str-from-string-array-default.ts'
      )
    );
    const obj = sourceFile.getFirstDescendantByKind(SyntaxKind.ObjectLiteralExpression);
    if (!obj) throw new Error('Expected object literal');

    const props = createSettingProperties({ defaultLiteralValue: ['item1', 'item2'] });
    const result = inferNixTypeAndEnumValues(
      obj,
      props,
      {
        type: undefined,
        description: undefined,
        default: ['item1', 'item2'],
        restartNeeded: false,
        hidden: false,
      },
      project.getTypeChecker(),
      project.getProgram()
    );

    expect(result.finalNixType).toBe('types.listOf types.str');
  });

  test('promotes OptionType.STRING with string array default to listOf str', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/type-inference/type-inference/05-promotes-option-type-string-with-string-array-default-to-list-of-str.ts'
      )
    );
    const obj = sourceFile.getFirstDescendantByKind(SyntaxKind.ObjectLiteralExpression);
    if (!obj) throw new Error('Expected object literal');

    const typeProp = obj.getProperty('type');
    const typeNode =
      typeProp?.getKind() === SyntaxKind.PropertyAssignment
        ? typeProp.asKindOrThrow(SyntaxKind.PropertyAssignment).getInitializer()
        : undefined;

    const props = createSettingProperties({ typeNode, defaultLiteralValue: [] });
    const result = inferNixTypeAndEnumValues(
      obj,
      props,
      {
        type: typeNode,
        description: undefined,
        default: [],
        restartNeeded: false,
        hidden: false,
      },
      project.getTypeChecker(),
      project.getProgram()
    );

    expect(result.finalNixType).toBe('types.listOf types.str');
    expect(result.defaultValue).toEqual([]);
  });

  test('promotes OptionType.STRING with empty array default to listOf str', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/type-inference/type-inference/06-promotes-option-type-string-with-empty-array-default-to-list-of-str.ts'
      )
    );
    const obj = sourceFile.getFirstDescendantByKind(SyntaxKind.ObjectLiteralExpression);
    if (!obj) throw new Error('Expected object literal');

    const typeProp = obj.getProperty('type');
    const typeNode =
      typeProp?.getKind() === SyntaxKind.PropertyAssignment
        ? typeProp.asKindOrThrow(SyntaxKind.PropertyAssignment).getInitializer()
        : undefined;

    const props = createSettingProperties({ typeNode, defaultLiteralValue: [] });
    const result = inferNixTypeAndEnumValues(
      obj,
      props,
      {
        type: typeNode,
        description: undefined,
        default: [],
        restartNeeded: false,
        hidden: false,
      },
      project.getTypeChecker(),
      project.getProgram()
    );

    expect(result.finalNixType).toBe('types.listOf types.str');
    expect(result.defaultValue).toEqual([]);
  });

  test('treats COMPONENT empty object array default as listOf str', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/type-inference/type-inference/07-treats-component-empty-object-array-default-as-list-of-str.ts'
      )
    );
    const obj = sourceFile.getFirstDescendantByKind(SyntaxKind.ObjectLiteralExpression);
    if (!obj) throw new Error('Expected object literal');

    const typeProp = obj.getProperty('type');
    const typeNode =
      typeProp?.getKind() === SyntaxKind.PropertyAssignment
        ? typeProp.asKindOrThrow(SyntaxKind.PropertyAssignment).getInitializer()
        : undefined;

    const props = createSettingProperties({ typeNode, defaultLiteralValue: [] });
    const result = inferNixTypeAndEnumValues(
      obj,
      props,
      {
        type: typeNode,
        description: undefined,
        default: [],
        restartNeeded: false,
        hidden: false,
      },
      project.getTypeChecker(),
      project.getProgram()
    );

    expect(result.finalNixType).toBe('types.listOf types.str');
    expect(result.defaultValue).toEqual([]);
  });

  test('infers listOf attrs from object array default', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/type-inference/type-inference/08-infers-list-of-attrs-from-object-array-default.ts'
      )
    );
    const obj = sourceFile.getFirstDescendantByKind(SyntaxKind.ObjectLiteralExpression);
    if (!obj) throw new Error('Expected object literal');

    const props = createSettingProperties({
      defaultLiteralValue: [{ key: 'value1' }, { key: 'value2' }],
    });
    const result = inferNixTypeAndEnumValues(
      obj,
      props,
      {
        type: undefined,
        description: undefined,
        default: [{ key: 'value1' }, { key: 'value2' }],
        restartNeeded: false,
        hidden: false,
      },
      project.getTypeChecker(),
      project.getProgram()
    );

    expect(result.finalNixType).toBe('types.listOf types.attrs');
  });

  test('coerces COMPONENT type with undefined default to attrs', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/type-inference/type-inference/09-coerces-component-type-with-undefined-default-to-attrs.ts'
      )
    );
    const obj = sourceFile.getFirstDescendantByKind(SyntaxKind.ObjectLiteralExpression);
    if (!obj) throw new Error('Expected object literal');

    const typeProp = obj.getProperty('type');
    const typeNode =
      typeProp?.getKind() === SyntaxKind.PropertyAssignment
        ? typeProp.asKindOrThrow(SyntaxKind.PropertyAssignment).getInitializer()
        : undefined;

    const props = createSettingProperties({ typeNode });
    const result = inferNixTypeAndEnumValues(
      obj,
      props,
      {
        type: typeNode,
        description: undefined,
        default: undefined,
        restartNeeded: false,
        hidden: false,
      },
      project.getTypeChecker(),
      project.getProgram()
    );

    expect(result.finalNixType).toBe('types.attrs');
  });

  test('preserves string default for COMPONENT type', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture(
        'core/ast/extractor/type-inference/type-inference/10-preserves-string-default-for-component-type.ts'
      )
    );
    const obj = sourceFile.getFirstDescendantByKind(SyntaxKind.ObjectLiteralExpression);
    if (!obj) throw new Error('Expected object literal');

    const props = createSettingProperties({ defaultLiteralValue: 'theme-name' });
    const result = inferNixTypeAndEnumValues(
      obj,
      props,
      {
        type: undefined,
        description: undefined,
        default: 'theme-name',
        restartNeeded: false,
        hidden: false,
      },
      project.getTypeChecker(),
      project.getProgram()
    );

    expect(result.finalNixType).toBe('types.str');
    expect(result.defaultValue).toBe('theme-name');
  });
});
