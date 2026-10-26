import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type * as Ast from 'typescript/ast';
import type * as NodeFactory from 'typescript/ast/factory';
import type { API as NativeAPI } from 'typescript/async';
import type * as FileSystem from 'typescript/fs';

type Replacement = string | Ast.Node | readonly Ast.Node[] | undefined;

export type Rule = {
  name: string;
  scope?: (file: Ast.SourceFile) => Ast.Node;
  select: (scope: Ast.Node) => readonly Ast.Node[];
  expected: number;
  replacement?: Replacement | ((node: Ast.Node) => Replacement);
};

// Select from a native snapshot, apply source spans in one batch, then validate
// the replacement snapshot before writing anything back to the bundle
export async function bundle(
  nativePath: string,
  filename: string,
  expressions: readonly string[] = []
) {
  // Nix supplies runtime-selected compiler modules outside the script source
  const { API }: { API: typeof NativeAPI } = await import(nativePath);
  const Node: typeof Ast = await import(resolve(dirname(nativePath), '../../ast/index.js'));
  const nodeFactory: typeof NodeFactory = await import(
    resolve(dirname(nativePath), '../../ast/factory.generated.js')
  );
  const { createFileSystemLayer }: typeof FileSystem = await import(
    resolve(dirname(nativePath), '../fs.js')
  );
  const { SyntaxKind } = Node;
  filename = resolve(filename);
  const config = resolve(dirname(filename), '.nixcord-patch.json');
  const expressionFiles = new Map(
    expressions.map((expression, i) => [
      resolve(dirname(filename), `.nixcord-expression-${i}.js`),
      `(${expression}\n);`,
    ])
  );
  let text = readFileSync(filename, 'utf8');
  const api = new API({ cwd: dirname(filename) });
  const fileSystem = createFileSystemLayer([
    [filename, text],
    [
      config,
      JSON.stringify({
        compilerOptions: { allowJs: true, noLib: true, noResolve: true, noEmit: true },
        files: [filename, ...expressionFiles.keys()],
      }),
    ],
    ...expressionFiles,
  ]);
  await using resources = new AsyncDisposableStack();
  resources.defer(() => api.close());
  const snapshot = resources.adopt(
    await api.createSnapshot({ openProjects: [config], fileSystem }),
    (snapshot) => snapshot.dispose()
  );
  const project = snapshot.getConfiguredProject(config)!;
  const file = (await project.program.getSourceFile(filename))!;
  async function validate(program: typeof project.program, path = filename): Promise<void> {
    const diagnostics = await program.getSyntacticDiagnostics(path);
    if (diagnostics.length)
      throw new Error(`${path}: ${diagnostics.map((d) => d.text).join('\n')}`);
  }
  const parsedExpressions: Ast.Expression[] = [];
  await validate(project.program);
  for (const path of expressionFiles.keys()) {
    await validate(project.program, path);
    const expressionFile = (await project.program.getSourceFile(path))!;
    const statement = one(expressionFile.statements, 'runtime expression statement');
    if (
      !Node.isExpressionStatement(statement) ||
      !Node.isParenthesizedExpression(statement.expression)
    )
      throw new Error(`${path}: expected a single expression`);
    parsedExpressions.push(statement.expression);
  }

  function one<T>(nodes: readonly T[], description: string): T {
    if (nodes.length !== 1)
      throw new Error(`${filename}: expected one ${description}, found ${nodes.length}`);
    return nodes[0];
  }
  function descendantsOfKind(root: Ast.Node, kind: Ast.SyntaxKind): Ast.Node[] {
    const nodes: Ast.Node[] = [];
    const visit = (node: Ast.Node): void => {
      node.forEachChild((child) => {
        if (child.kind === kind) nodes.push(child);
        visit(child);
      });
    };
    visit(root);
    return nodes;
  }
  function forEachDescendant<T>(
    root: Ast.Node,
    callback: (node: Ast.Node) => T | undefined
  ): T | undefined {
    return root.forEachChild((child) => callback(child) ?? forEachDescendant(child, callback));
  }
  function expectKind<K extends Ast.SyntaxKind>(node: Ast.Node, kind: K): Ast.Node {
    if (node.kind !== kind) throw new Error(`${filename}: unexpected ${SyntaxKind[node.kind]}`);
    return node;
  }
  function firstAncestor(node: Ast.Node, kind: Ast.SyntaxKind): Ast.Node | undefined {
    for (let parent = node.parent; parent; parent = parent.parent)
      if (parent.kind === kind) return parent;
    return undefined;
  }
  function parentOf(node: Ast.Node, kind: Ast.SyntaxKind): Ast.Node {
    return expectKind(node.parent, kind);
  }
  function referenceName(node: Ast.Node): string | undefined {
    if (Node.isIdentifier(node)) return node.text;
    if (Node.isPropertyAccessExpression(node)) {
      const receiver = referenceName(node.expression);
      if (receiver !== undefined) return `${receiver}.${node.name.text}`;
    }
    return undefined;
  }
  function values(root: Ast.Node, name: string): Ast.Expression[] {
    return [
      ...descendantsOfKind(root, SyntaxKind.BinaryExpression)
        .filter(Node.isBinaryExpression)
        .filter(
          (node) =>
            node.operatorToken.kind === SyntaxKind.EqualsToken && referenceName(node.left) === name
        )
        .map((node) => node.right),
      ...descendantsOfKind(root, SyntaxKind.VariableDeclaration)
        .filter(Node.isVariableDeclaration)
        .filter((node) => referenceName(node.name) === name)
        .map((node) => {
          if (!node.initializer) throw new Error(`${filename}: missing initializer for ${name}`);
          return node.initializer;
        }),
    ];
  }
  function factory(
    predicate: (node: Ast.MethodDeclaration) => boolean,
    description: string
  ): Ast.MethodDeclaration {
    return one(
      descendantsOfKind(file, SyntaxKind.MethodDeclaration)
        .filter(Node.isMethodDeclaration)
        .filter(
          (node) =>
            Node.isObjectLiteralExpression(node.parent) &&
            Node.isNumericLiteral(node.name) &&
            predicate(node)
        ),
      description
    );
  }
  const ownedResources = resources.move();
  const dispose = () => ownedResources.disposeAsync();
  async function apply(rules: readonly Rule[]): Promise<number> {
    try {
      const replacements = rules
        .flatMap((rule) => {
          const matches = rule.select(rule.scope ? rule.scope(file) : file);
          if (matches.length !== rule.expected)
            throw new Error(
              `${filename}: expected ${rule.expected} ${rule.name}, found ${matches.length}`
            );
          const replacement = rule.replacement;
          return replacement === undefined
            ? []
            : matches.flatMap((node) => {
                const value = typeof replacement === 'function' ? replacement(node) : replacement;
                return value === undefined ? [] : [{ node, value }];
              });
        })
        .sort((a, b) => a.node.getStart() - b.node.getStart());
      for (let i = 1; i < replacements.length; i++)
        if (replacements[i].node.getStart() < replacements[i - 1].node.end)
          throw new Error(`${filename}: overlapping bundle patches`);
      const edits = await Promise.all(
        replacements.map(async ({ node, value }) => ({
          node,
          text:
            typeof value === 'string'
              ? value
              : (
                  await Promise.all(
                    (Array.isArray(value) ? value : [value]).map((replacement) =>
                      api.printer.printNode(replacement)
                    )
                  )
                ).join('\n'),
        }))
      );
      for (const edit of edits.toReversed())
        text = text.slice(0, edit.node.getStart()) + edit.text + text.slice(edit.node.end);
      await api.runWithTemporaryFileUpdate(snapshot, filename, text, async (replacement) => {
        await validate(replacement.getConfiguredProject(config)!.program);
      });
      writeFileSync(filename, text);
      return edits.length;
    } finally {
      await dispose();
    }
  }
  return {
    [Symbol.asyncDispose]: dispose,
    Node,
    nodeFactory,
    parsedExpressions,
    SyntaxKind,
    factory,
    values,
    one,
    referenceName,
    apply,
    descendantsOfKind,
    forEachDescendant,
    parentOf,
    expectKind,
    firstAncestor,
  };
}
