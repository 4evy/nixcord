import { SyntaxKind } from 'ts-morph';
import { describe, expect, test } from 'vitest';
import {
  resolveIdentifierInitializerNode,
  resolveIdentifierWithFallback,
} from '../../../../../src/foundation/index.js';
import { createProject, loadFixture } from '../../../../helpers/test-utils.js';

const initializerCases = [
  {
    name: 'resolves a string constant',
    fixture: 'core/ast/extractor/node-utils/identifier-resolver/string-constant.ts',
    kind: SyntaxKind.StringLiteral,
  },
  {
    name: 'resolves a numeric constant',
    fixture: 'core/ast/extractor/node-utils/identifier-resolver/numeric-constant.ts',
    kind: SyntaxKind.NumericLiteral,
  },
  {
    name: 'rejects a non-identifier',
    fixture: 'core/ast/extractor/node-utils/identifier-resolver/non-identifier.ts',
    kind: undefined,
  },
  {
    name: 'rejects an unresolved identifier',
    fixture: 'core/ast/extractor/node-utils/identifier-resolver/unresolved.ts',
    kind: undefined,
  },
] as const;

const fallbackCases = [
  {
    name: 'resolves a const declaration',
    fixture: 'core/ast/extractor/node-utils/identifier-resolver/string-constant.ts',
    kind: SyntaxKind.StringLiteral,
  },
  {
    name: 'searches mutable declarations',
    fixture: 'core/ast/extractor/node-utils/identifier-resolver/mutable-declaration.ts',
    kind: SyntaxKind.StringLiteral,
  },
  {
    name: 'rejects a non-identifier',
    fixture: 'core/ast/extractor/node-utils/identifier-resolver/non-identifier.ts',
    kind: undefined,
  },
  {
    name: 'rejects an identifier without a declaration',
    fixture: 'core/ast/extractor/node-utils/identifier-resolver/unresolved.ts',
    kind: undefined,
  },
] as const;

const resolveCase = (
  fixture: string,
  resolve: typeof resolveIdentifierInitializerNode
): SyntaxKind | undefined => {
  const project = createProject();
  const sourceFile = project.createSourceFile('test.ts', loadFixture(fixture));
  const initializer = sourceFile.getVariableDeclarationOrThrow('x').getInitializerOrThrow();
  return resolve(initializer, project.getTypeChecker())?.getKind();
};

describe('resolveIdentifierInitializerNode()', () => {
  test.each(initializerCases)('$name', ({ fixture, kind }) => {
    expect(resolveCase(fixture, resolveIdentifierInitializerNode)).toBe(kind);
  });
});

describe('resolveIdentifierWithFallback()', () => {
  test.each(fallbackCases)('$name', ({ fixture, kind }) => {
    expect(resolveCase(fixture, resolveIdentifierWithFallback)).toBe(kind);
  });
});
