import type * as Morph from 'ts-morph';

export type Rule = {
  name: string;
  scope?: (file: Morph.SourceFile) => Morph.Node;
  select: (scope: Morph.Node) => readonly Morph.Node[];
  expected: number;
  replacement?: string | ((node: Morph.Node) => string);
};

// ts-morph owns traversal, parsing and edits; rules describe upstream contracts
function bundle(morphPath: string, filename: string) {
  const { Node, Project, SyntaxKind }: typeof Morph = require(morphPath);
  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: true, noLib: true, noResolve: true },
  });
  const fs: typeof import('node:fs') = require('node:fs');
  const file = project.createSourceFile(filename, fs.readFileSync(filename, 'utf8'));

  function validate(): void {
    const diagnostics = project.getProgram().getSyntacticDiagnostics(file);
    if (diagnostics.length)
      throw new Error(project.formatDiagnosticsWithColorAndContext(diagnostics));
  }
  validate();

  function one<T>(nodes: readonly T[], description: string): T {
    if (nodes.length !== 1) {
      throw new Error(`${filename}: expected one ${description}, found ${nodes.length}`);
    }
    return nodes[0];
  }

  // Computed references require an upstream review, not a guessed match
  function referenceName(node: Morph.Node): string | undefined {
    if (Node.isIdentifier(node)) return node.getText();
    if (Node.isPropertyAccessExpression(node)) {
      const receiver = referenceName(node.getExpression());
      if (receiver !== undefined) return `${receiver}.${node.getName()}`;
    }
    return undefined;
  }

  function values(root: Morph.Node, name: string): Morph.Expression[] {
    return [
      ...root
        .getDescendantsOfKind(SyntaxKind.BinaryExpression)
        .filter(
          (node) =>
            node.getOperatorToken().getKind() === SyntaxKind.EqualsToken &&
            referenceName(node.getLeft()) === name
        )
        .map((node) => node.getRight()),
      ...root
        .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
        .filter((node) => referenceName(node.getNameNode()) === name)
        .map((node) => node.getInitializerOrThrow()),
    ];
  }

  function factory(
    predicate: (node: Morph.MethodDeclaration) => boolean,
    description: string
  ): Morph.MethodDeclaration {
    return one(
      file
        .getDescendantsOfKind(SyntaxKind.MethodDeclaration)
        .filter(
          (node) =>
            Node.isObjectLiteralExpression(node.getParent()) &&
            Node.isNumericLiteral(node.getNameNode()) &&
            predicate(node)
        ),
      description
    );
  }

  function apply(rules: readonly Rule[]): number {
    // Resolve every selector before editing, then reject duplicate/nested targets
    // A failed contract never writes a partially patched bundle
    const edits = rules
      .flatMap((rule) => {
        const matches = rule.select(rule.scope ? rule.scope(file) : file);
        if (matches.length !== rule.expected) {
          throw new Error(
            `${filename}: expected ${rule.expected} ${rule.name}, found ${matches.length}`
          );
        }
        const replacement = rule.replacement;
        if (replacement === undefined) return [];
        return matches.map((node) => ({
          node,
          text: typeof replacement === 'string' ? replacement : replacement(node),
        }));
      })
      .sort((a, b) => a.node.getStart() - b.node.getStart());
    for (let i = 1; i < edits.length; i++) {
      if (edits[i].node.getStart() < edits[i - 1].node.getEnd()) {
        throw new Error(`${filename}: overlapping bundle patches`);
      }
    }
    // Batch AST-selected edits so a minified bundle is reparsed only once
    file.applyTextChanges(
      edits.map(({ node, text }) => ({
        span: { start: node.getStart(), length: node.getWidth() },
        newText: text,
      }))
    );
    validate();
    fs.writeFileSync(filename, file.getFullText());
    return edits.length;
  }

  return { Node, SyntaxKind, factory, values, one, referenceName, apply };
}

// Node strips types without rewriting exports, so the runtime stays CommonJS
module.exports = bundle;
export type Bundle = typeof bundle;
