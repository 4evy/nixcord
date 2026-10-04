import { isAbsolute, relative, resolve, sep } from 'node:path';
import {
  type ImportDeclaration,
  type Node,
  type SourceFile,
  SyntaxKind,
  type TypeChecker,
} from 'ts-morph';
import { resolvedDeclaration } from '../nodes.js';

// Resolve module bindings without crossing the permitted source root
interface ImportBinding {
  readonly localName: string;
  readonly moduleName: string;
  readonly importedName: string;
  readonly declaration: ImportDeclaration;
  readonly reference: Node;
}

export const declarationKey = (declaration: Node): string =>
  `${declaration.getSourceFile().getFilePath()}:${declaration.getStart()}`;

export const isWithinRoot = (filePath: string, allowedRoot: string): boolean => {
  const pathFromRoot = relative(resolve(allowedRoot), resolve(filePath));
  return (
    pathFromRoot === '' ||
    (pathFromRoot !== '..' && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot))
  );
};

export const topLevelDeclaration = (declaration: Node): Node | undefined => {
  const candidate = declaration.isKind(SyntaxKind.VariableDeclaration)
    ? declaration.getVariableStatement()
    : declaration;
  if (candidate?.getParent()?.isKind(SyntaxKind.SourceFile)) return candidate;
  const ancestor = candidate?.getFirstAncestor((node) =>
    Boolean(node.getParent()?.isKind(SyntaxKind.SourceFile))
  );
  return ancestor?.isKind(SyntaxKind.ImportDeclaration) ? undefined : ancestor;
};

const importBinding = (identifier: Node, checker: TypeChecker): ImportBinding | undefined => {
  let declaration: Node | undefined;
  try {
    const shorthand = identifier.getParentIfKind(SyntaxKind.ShorthandPropertyAssignment);
    // Shorthand properties expose a property symbol instead of the imported value
    const symbol =
      shorthand?.getNameNode() === identifier
        ? checker.getShorthandAssignmentValueSymbol(shorthand)
        : checker.getSymbolAtLocation(identifier);
    declaration = symbol?.getDeclarations()[0];
  } catch {
    return undefined;
  }
  const importDeclaration = declaration?.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);
  if (
    !declaration ||
    !importDeclaration ||
    importDeclaration.getSourceFile() !== identifier.getSourceFile()
  )
    return undefined;
  const moduleName = importDeclaration.getModuleSpecifierValue();
  if (declaration.isKind(SyntaxKind.ImportSpecifier)) {
    return {
      localName: declaration.getAliasNode()?.getText() ?? declaration.getName(),
      moduleName,
      importedName: declaration.getName(),
      declaration: importDeclaration,
      reference: identifier,
    };
  }
  if (declaration.isKind(SyntaxKind.NamespaceImport)) {
    return {
      localName: declaration.getName(),
      moduleName,
      importedName: '*',
      declaration: importDeclaration,
      reference: identifier,
    };
  }
  if (declaration.isKind(SyntaxKind.ImportClause)) {
    const name = declaration.getDefaultImport()?.getText();
    return name
      ? {
          localName: name,
          moduleName,
          importedName: 'default',
          declaration: importDeclaration,
          reference: identifier,
        }
      : undefined;
  }
  return undefined;
};

export const bindingTarget = (
  binding: ImportBinding | undefined,
  checker: TypeChecker
): Node | undefined => {
  if (!binding) return undefined;
  const declaration = resolvedDeclaration(binding.reference, checker);
  if (
    declaration?.isKind(SyntaxKind.ImportSpecifier) ||
    declaration?.isKind(SyntaxKind.ImportClause) ||
    declaration?.isKind(SyntaxKind.NamespaceImport) ||
    declaration?.isKind(SyntaxKind.SourceFile)
  )
    return undefined;
  return declaration;
};

export const resolvedComponentTarget = (component: Node, checker: TypeChecker): Node => {
  const declaration = resolvedDeclaration(component, checker);
  if (
    declaration?.isKind(SyntaxKind.VariableDeclaration) ||
    declaration?.isKind(SyntaxKind.FunctionDeclaration) ||
    declaration?.isKind(SyntaxKind.ClassDeclaration) ||
    declaration?.isKind(SyntaxKind.MethodDeclaration)
  )
    return declaration;
  return component;
};

export const localDeclarationName = (
  declaration: Node,
  defaultNames: ReadonlyMap<string, string>
) => {
  if (declaration.isKind(SyntaxKind.VariableDeclaration)) {
    const name = declaration.getNameNode();
    return name.isKind(SyntaxKind.Identifier) ? name.getText() : undefined;
  }
  if (
    declaration.isKind(SyntaxKind.FunctionDeclaration) ||
    declaration.isKind(SyntaxKind.ClassDeclaration) ||
    declaration.isKind(SyntaxKind.EnumDeclaration)
  )
    return declaration.getName();
  const topLevel = topLevelDeclaration(declaration);
  return topLevel?.isKind(SyntaxKind.ExportAssignment)
    ? defaultNames.get(declarationKey(topLevel))
    : undefined;
};

export const directTopLevelBindingName = (declaration: Node): string | undefined => {
  if (declaration.isKind(SyntaxKind.VariableDeclaration)) {
    if (!declaration.getVariableStatement()?.getParent()?.isKind(SyntaxKind.SourceFile))
      return undefined;
    const name = declaration.getNameNode();
    return name.isKind(SyntaxKind.Identifier) ? name.getText() : undefined;
  }
  if (
    declaration.getParent()?.isKind(SyntaxKind.SourceFile) &&
    (declaration.isKind(SyntaxKind.FunctionDeclaration) ||
      declaration.isKind(SyntaxKind.ClassDeclaration) ||
      declaration.isKind(SyntaxKind.EnumDeclaration))
  )
    return declaration.getName();
  return undefined;
};

export const importBindingsFor = (
  nodes: readonly Node[],
  checker: TypeChecker
): ImportBinding[] => {
  const bindings = new Map<string, ImportBinding>();
  for (const node of nodes) {
    for (const identifier of [
      ...(node.isKind(SyntaxKind.Identifier) ? [node] : []),
      ...node.getDescendantsOfKind(SyntaxKind.Identifier),
    ]) {
      const binding = importBinding(identifier, checker);
      if (binding) bindings.set(binding.localName, binding);
    }
  }
  return [...bindings.values()].sort((left, right) =>
    left.localName.localeCompare(right.localName)
  );
};

export const exportedNames = (
  sourceFile: SourceFile,
  selectedDeclarations: ReadonlySet<string>,
  defaultNames: ReadonlyMap<string, string>,
  checker: TypeChecker
): Map<string, string> => {
  const exports = new Map<string, string>();
  for (const [exportName, declarations] of sourceFile.getExportedDeclarations()) {
    for (const original of declarations) {
      const resolved = resolvedDeclaration(original, checker) ?? original;
      const topLevel = topLevelDeclaration(resolved);
      if (!topLevel || !selectedDeclarations.has(declarationKey(topLevel))) continue;
      const localName = localDeclarationName(resolved, defaultNames);
      if (localName) {
        exports.set(exportName, localName);
        break;
      }
    }
  }
  return exports;
};
