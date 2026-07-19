import { SyntaxKind } from 'ts-morph';
import { describe, expect, test } from 'vitest';
import { resolveCallExpressionReturn } from '../../../../../src/foundation/index.js';
import { createProject, loadFixture } from '../../../../helpers/test-utils.js';

const cases = [
  {
    name: 'resolves an arrow function object body',
    fixture: 'core/ast/extractor/node-utils/call-resolver/arrow-object.ts',
    kind: SyntaxKind.ObjectLiteralExpression,
  },
  {
    name: 'resolves an arrow function array body',
    fixture: 'core/ast/extractor/node-utils/call-resolver/arrow-array.ts',
    kind: SyntaxKind.ArrayLiteralExpression,
  },
  {
    name: 'rejects a non-call expression',
    fixture: 'core/ast/extractor/node-utils/call-resolver/non-call.ts',
    kind: undefined,
  },
  {
    name: 'rejects an unresolved function',
    fixture: 'core/ast/extractor/node-utils/call-resolver/unresolved.ts',
    kind: undefined,
  },
  {
    name: 'resolves through same-file symbol lookup',
    fixture: 'core/ast/extractor/node-utils/call-resolver/same-file.ts',
    kind: SyntaxKind.ObjectLiteralExpression,
  },
  {
    name: 'does not execute a function declaration',
    fixture: 'core/ast/extractor/node-utils/call-resolver/function-declaration.ts',
    kind: undefined,
  },
] as const;

describe('resolveCallExpressionReturn()', () => {
  test.each(cases)('$name', ({ fixture, kind }) => {
    const project = createProject();
    const sourceFile = project.createSourceFile('test.ts', loadFixture(fixture));
    const initializer = sourceFile.getVariableDeclarationOrThrow('x').getInitializerOrThrow();

    const resolved = resolveCallExpressionReturn(initializer, project.getTypeChecker());

    expect(resolved?.getKind()).toBe(kind);
  });
});
