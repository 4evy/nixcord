import { Project, SyntaxKind, type TypeChecker } from 'ts-morph';
import { describe, expect, test } from 'vitest';
import { StaticEvaluator } from '../../../src/evaluator.js';

const evaluateInitializer = (source: string, name = 'result') => {
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile('/fixture.ts', source);
  const initializer = sourceFile.getVariableDeclarationOrThrow(name).getInitializerOrThrow();
  return new StaticEvaluator(project.getTypeChecker()).evaluate(initializer);
};

describe('StaticEvaluator', () => {
  test('evaluates generated object pipelines through one intrinsic registry', () => {
    const result = evaluateInitializer(`
      const base = { first: 1, second: 2 } as const;
      const result = Object.fromEntries(
        Object.entries(base).map(([key, value]) => [key, { default: value * 2 }])
      );
    `);

    expect(result).toMatchObject({
      known: true,
      value: { first: { default: 2 }, second: { default: 4 } },
    });
  });

  test('supports local calls, destructuring, templates, and reduce', () => {
    const result = evaluateInitializer(`
      const build = (prefix: string, values = [1, 2, 3]) =>
        values.reduce((acc, value) => ({ ...acc, [\`${'${prefix}'}${'${value}'}\`]: value }), {});
      const result = build("item");
    `);

    expect(result).toMatchObject({
      known: true,
      value: { item1: 1, item2: 2, item3: 3 },
    });
  });

  test('resolves cross-file aliases with the TypeScript checker', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile('/values.ts', 'export const choices = ["one", "two"] as const;');
    const sourceFile = project.createSourceFile(
      '/fixture.ts',
      'import { choices } from "./values"; const result = [...choices, "three"];'
    );
    project.resolveSourceFileDependencies();
    const initializer = sourceFile.getVariableDeclarationOrThrow('result').getInitializerOrThrow();
    const result = new StaticEvaluator(project.getTypeChecker()).evaluate(initializer);
    expect(result).toMatchObject({ known: true, value: ['one', 'two', 'three'] });
  });

  test('falls back to source declarations when a partial project cannot bind a local symbol', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile(
      '/fixture.ts',
      'const choices = ["one", "two"]; const result = choices.map(value => value);'
    );
    const initializer = sourceFile.getVariableDeclarationOrThrow('result').getInitializerOrThrow();
    const checker = { getSymbolAtLocation: () => undefined } as unknown as TypeChecker;
    const result = new StaticEvaluator(checker).evaluate(initializer);
    expect(result).toMatchObject({ known: true, value: ['one', 'two'] });
  });

  test('evaluates shorthand properties and configured profile constants', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile(
      '/fixture.ts',
      'const api = "https://example.test"; const result = { api, task: QuestTaskType.PLAY };'
    );
    const initializer = source.getVariableDeclarationOrThrow('result').getInitializerOrThrow();
    const result = new StaticEvaluator(project.getTypeChecker(), {
      constants: { 'QuestTaskType.PLAY': 'PLAY' },
    }).evaluate(initializer);
    expect(result).toMatchObject({
      known: true,
      value: { api: 'https://example.test', task: 'PLAY' },
    });
  });

  test('represents nondeterministic UUID defaults as omitted values', () => {
    const result = evaluateInitializer('const result = { find: "", id: crypto.randomUUID() };');
    expect(result).toMatchObject({ known: true, value: { find: '', id: undefined } });
  });

  test('returns an explicit unknown result for cycles and budgets', () => {
    const cycle = evaluateInitializer(
      'const first = second; const second = first; const result = first;'
    );
    expect(cycle).toMatchObject({ known: false, reason: 'cyclic expression dependency' });

    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile('/budget.ts', 'const result = [1, 2, 3, 4];');
    const initializer = source
      .getDescendantsOfKind(SyntaxKind.VariableDeclaration)[0]
      .getInitializerOrThrow();
    const budget = new StaticEvaluator(project.getTypeChecker(), { maxOperations: 2 }).evaluate(
      initializer
    );
    expect(budget).toMatchObject({ known: false, reason: 'evaluation operation limit exceeded' });
  });

  test('keeps computed property evaluation inside the active cycle and depth budgets', () => {
    const result = evaluateInitializer('const result = { [result]: 1 };');
    expect(result).toMatchObject({ known: false, reason: 'cyclic expression dependency' });
  });

  test('charges Array.from output against the operation budget before allocating it', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile(
      '/array-from-budget.ts',
      'const result = Array.from({ length: 100_000 });'
    );
    const initializer = source.getVariableDeclarationOrThrow('result').getInitializerOrThrow();
    const result = new StaticEvaluator(project.getTypeChecker(), {
      maxOperations: 20,
    }).evaluate(initializer);

    expect(result).toMatchObject({
      known: false,
      reason: 'evaluation operation limit exceeded',
    });
  });
});
