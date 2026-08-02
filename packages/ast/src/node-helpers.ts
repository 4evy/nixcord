import { dirname, resolve } from 'node:path';
import { type Node, SyntaxKind, type TypeChecker } from 'ts-morph';

const IMPORT_SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts'] as const;

const relativeImportSource = (node: Node, moduleName: string): Node | undefined => {
  if (!moduleName.startsWith('.')) return undefined;
  const sourceFile = node.getSourceFile();
  const base = resolve(dirname(sourceFile.getFilePath()), moduleName);
  const candidates = new Set([
    base,
    ...IMPORT_SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...IMPORT_SOURCE_EXTENSIONS.map((extension) => resolve(base, `index${extension}`)),
  ]);
  return sourceFile
    .getProject()
    .getSourceFiles()
    .find((candidate) => candidates.has(candidate.getFilePath()));
};

const importedDeclaration = (node: Node): Node | undefined => {
  if (!node.isKind(SyntaxKind.Identifier)) return undefined;
  const localName = node.getText();
  for (const importDeclaration of node.getSourceFile().getImportDeclarations()) {
    const namedImport = importDeclaration
      .getNamedImports()
      .find(
        (specifier) => (specifier.getAliasNode()?.getText() ?? specifier.getName()) === localName
      );
    const defaultImport = importDeclaration.getDefaultImport();
    const importedName =
      namedImport?.getName() ?? (defaultImport?.getText() === localName ? 'default' : undefined);
    if (!importedName) continue;
    const importedFile =
      importDeclaration.getModuleSpecifierSourceFile() ??
      relativeImportSource(node, importDeclaration.getModuleSpecifierValue());
    const declarations = importedFile
      ?.asKind(SyntaxKind.SourceFile)
      ?.getExportedDeclarations()
      .get(importedName);
    if (declarations?.length) return declarations[0];
  }
  return undefined;
};

export const resolvedDeclaration = (node: Node, checker: TypeChecker): Node | undefined => {
  try {
    const symbol = checker.getSymbolAtLocation(node) ?? node.getSymbol();
    const resolved = symbol?.isAlias() ? symbol.getAliasedSymbol() : symbol;
    return (
      resolved?.getValueDeclaration() ?? resolved?.getDeclarations()[0] ?? importedDeclaration(node)
    );
  } catch {
    return importedDeclaration(node);
  }
};

export const unwrapExpression = (node: Node): Node => {
  let current = node;
  while (
    current.isKind(SyntaxKind.AsExpression) ||
    current.isKind(SyntaxKind.TypeAssertionExpression) ||
    current.isKind(SyntaxKind.ParenthesizedExpression) ||
    current.isKind(SyntaxKind.NonNullExpression) ||
    current.isKind(SyntaxKind.SatisfiesExpression)
  )
    current = current.getExpression();
  return current;
};
