import fc from 'fast-check';
import { SyntaxKind } from 'ts-morph';
import { describe, expect, test } from 'vitest';
import { tsTypeToNixType } from '../../../src/parser.js';
import { createProject, loadFixture } from '../../helpers/test-utils.js';

const optionTypeCases = [
  { name: 'STRING', expected: 'types.str' },
  { name: 'NUMBER', expected: 'types.float' },
  { name: 'BIGINT', expected: 'types.int' },
  { name: 'BOOLEAN', expected: 'types.bool' },
  { name: 'SELECT', expected: 'types.str' },
  { name: 'SLIDER', expected: 'types.float' },
] as const;

describe('tsTypeToNixType()', () => {
  test('type inference from boolean default -> types.bool', () => {
    const project = createProject();
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    const result = tsTypeToNixType({ default: true }, program, checker);
    expect(result.nixType).toBe('types.bool');
  });

  test('type inference from string default -> types.str', () => {
    const project = createProject();
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    const result = tsTypeToNixType({ default: 'test' }, program, checker);
    expect(result.nixType).toBe('types.str');
  });

  test('type inference from integer default -> types.int', () => {
    const project = createProject();
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    const result = tsTypeToNixType({ default: 42 }, program, checker);
    expect(result.nixType).toBe('types.int');
  });

  test('type inference from float default -> types.float', () => {
    const project = createProject();
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    const result = tsTypeToNixType({ default: 3.14 }, program, checker);
    expect(result.nixType).toBe('types.float');
  });

  test('NumericLiteral types', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/parser/01-numeric-literal-types.ts')
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const typeProp = objLiteral.getProperty('type');
    const typeNode = typeProp?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    if (!typeNode) {
      throw new Error('Type node not found');
    }
    const result = tsTypeToNixType({ type: typeNode }, program, checker);
    expect(result.nixType).toBe('types.str');
  });

  test('returns types.str as fallback', () => {
    const project = createProject();
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    const result = tsTypeToNixType({}, program, checker);
    expect(result.nixType).toBe('types.str');
  });

  test('OptionTypeMap mapping - BOOLEAN', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/parser/02-option-type-map-mapping-boolean.ts')
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const typeProp = objLiteral.getProperty('type');
    const typeNode = typeProp?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    if (!typeNode) {
      throw new Error('Type node not found');
    }
    const result = tsTypeToNixType({ type: typeNode }, program, checker);
    // Should map BOOLEAN to types.bool
    expect(result.nixType).toBe('types.bool');
  });

  test('OptionTypeMap mapping - STRING', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/parser/03-option-type-map-mapping-string.ts')
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const typeProp = objLiteral.getProperty('type');
    const typeNode = typeProp?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    if (!typeNode) {
      throw new Error('Type node not found');
    }
    const result = tsTypeToNixType({ type: typeNode }, program, checker);
    expect(result.nixType).toBe('types.str');
  });

  test('OptionTypeMap mapping - NUMBER', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/parser/04-option-type-map-mapping-number.ts')
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const typeProp = objLiteral.getProperty('type');
    const typeNode = typeProp?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
    const defaultProp = objLiteral.getProperty('default');
    const defaultNode = defaultProp
      ?.asKind(SyntaxKind.PropertyAssignment)
      ?.getInitializer()
      ?.asKind(SyntaxKind.NumericLiteral)
      ?.getLiteralValue();
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    if (!typeNode) {
      throw new Error('Type node not found');
    }
    const result = tsTypeToNixType({ type: typeNode, default: defaultNode }, program, checker);
    expect(result.nixType).toBe('types.int');
  });

  test('OptionTypeMap mapping - NUMBER with float default', () => {
    const project = createProject();
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    const result = tsTypeToNixType({ type: undefined, default: 3.14 }, program, checker);
    expect(result.nixType).toBe('types.float');
  });

  test('OptionTypeMap mapping - SELECT', () => {
    const project = createProject();
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    const result = tsTypeToNixType(
      {
        type: undefined,
        options: [{ value: 'option1' }, { value: 'option2' }],
      },
      program,
      checker
    );
    expect(result.nixType).toBe('types.enum');
  });

  test('OptionTypeMap mapping - COMPONENT', () => {
    const project = createProject();
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    const result = tsTypeToNixType({ type: 6, default: { key: 'value' } }, program, checker);
    expect(result.nixType).toBe('types.attrs');
  });

  test('OptionTypeMap mapping - CUSTOM', () => {
    const project = createProject();
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    const result = tsTypeToNixType({ type: 7, default: { key: 'value' } }, program, checker);
    expect(result.nixType).toBe('types.attrs');
  });

  test('prefers concrete OptionType when unioned with CUSTOM', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/parser/05-prefers-concrete-option-type-when-unioned-with-custom.ts')
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const typeNode = objLiteral
      .getProperty('type')
      ?.asKind(SyntaxKind.PropertyAssignment)
      ?.getInitializer();
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    if (!typeNode) throw new Error('Type node not found');
    const result = tsTypeToNixType({ type: typeNode, default: 42 }, program, checker);
    expect(result.nixType).toBe('types.int');
  });

  test('OptionTypeMap mapping - BIGINT', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/parser/06-option-type-map-mapping-bigint.ts')
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const typeProp = objLiteral.getProperty('type');
    const typeNode = typeProp?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    if (!typeNode) {
      throw new Error('Type node not found');
    }
    const result = tsTypeToNixType({ type: typeNode }, program, checker);
    // BIGINT maps to types.int
    expect(result.nixType).toBe('types.int');
  });

  test('handles enum member resolution (numeric)', () => {
    const project = createProject();
    const sourceFile = project.createSourceFile(
      'test.ts',
      loadFixture('core/ast/parser/07-handles-enum-member-resolution-numeric.ts')
    );
    const objLiteral = sourceFile
      .getVariableDeclarationOrThrow('obj')
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const typeProp = objLiteral.getProperty('type');
    const typeNode = typeProp?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    if (!typeNode) {
      throw new Error('Type node not found');
    }
    const result = tsTypeToNixType({ type: typeNode }, program, checker);
    expect(result.nixType).toBe('types.bool');
  });

  test('handles object default for CUSTOM/COMPONENT', () => {
    const project = createProject();
    const checker = project.getTypeChecker();
    const program = project.getProgram();
    const result = tsTypeToNixType(
      { type: 6, default: { nested: { key: 'value' } } },
      program,
      checker
    );
    expect(result.nixType).toBe('types.attrs');
  });

  test('resolves supported OptionType enum members by source enum name', () => {
    fc.assert(
      fc.property(fc.constantFrom(...optionTypeCases), ({ name, expected }) => {
        const project = createProject();
        const sourceFile = project.createSourceFile(
          'test.ts',
          loadFixture('core/ast/parser/option-type-enum-members.ts')
        );
        const objLiteral = sourceFile
          .getVariableDeclarationOrThrow(name)
          .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
        const typeNode = objLiteral
          .getProperty('type')
          ?.asKind(SyntaxKind.PropertyAssignment)
          ?.getInitializer();
        const checker = project.getTypeChecker();
        const program = project.getProgram();
        if (!typeNode) throw new Error('Type node not found');

        expect(tsTypeToNixType({ type: typeNode }, program, checker).nixType).toBe(expected);
      })
    );
  });
});
