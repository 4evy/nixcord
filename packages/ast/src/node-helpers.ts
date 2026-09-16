import { type Node, SyntaxKind, type TypeChecker, ts } from 'ts-morph';

const importSource = (node: Node, moduleName: string): Node | undefined => {
  const sourceFile = node.getSourceFile();
  const project = sourceFile.getProject();
  const resolution = ts.resolveModuleName(
    moduleName.replace(/\?.*$/, ''),
    sourceFile.getFilePath(),
    { moduleResolution: ts.ModuleResolutionKind.Bundler, ...project.getCompilerOptions() },
    project.getModuleResolutionHost()
  );
  return resolution.resolvedModule
    ? project.getSourceFile(resolution.resolvedModule.resolvedFileName)
    : undefined;
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
      importSource(node, importDeclaration.getModuleSpecifierValue());
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
    const shorthand = node.getParentIfKind(SyntaxKind.ShorthandPropertyAssignment);
    const symbol =
      (shorthand && checker.getShorthandAssignmentValueSymbol(shorthand)) ??
      checker.getSymbolAtLocation(node) ??
      node.getSymbol();
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
