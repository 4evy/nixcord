import { resolvedDeclaration, type StaticEvaluator, unwrapExpression } from '@nixcord/ast';
import {
  type CallExpression,
  Node,
  type ObjectLiteralExpression,
  type SourceFile,
  SyntaxKind,
  type TypeChecker,
} from 'ts-morph';
import type { SourceProfile } from './profiles.js';

// Resolve canonical upstream API calls and their source-level bindings
export const importIdentity = (
  expression: Node
): { readonly moduleName: string; readonly importedName: string } | undefined => {
  try {
    const declaration = expression.getSymbol()?.getDeclarations()[0];
    const importDeclaration = declaration?.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);
    if (!declaration || !importDeclaration) return undefined;
    const moduleName = importDeclaration.getModuleSpecifierValue();
    if (declaration.isKind(SyntaxKind.ImportSpecifier)) {
      return { moduleName, importedName: declaration.getName() };
    }
    if (declaration.isKind(SyntaxKind.ImportClause)) {
      return { moduleName, importedName: 'default' };
    }
    if (declaration.isKind(SyntaxKind.NamespaceImport)) {
      return { moduleName, importedName: '*' };
    }
  } catch {
    return undefined;
  }
  return undefined;
};

const callName = (call: CallExpression): string | undefined => {
  const expression = call.getExpression();
  if (expression.isKind(SyntaxKind.Identifier)) return expression.getText();
  if (expression.isKind(SyntaxKind.PropertyAccessExpression)) return expression.getName();
  return undefined;
};

const isApiCall = (
  call: CallExpression,
  canonicalName: string,
  profile: SourceProfile,
  checker: TypeChecker
): boolean => {
  try {
    const expression = call.getExpression();
    const identity = importIdentity(
      expression.isKind(SyntaxKind.PropertyAccessExpression)
        ? expression.getExpression()
        : expression
    );
    const allowedModules = profile.apiDeclarations[canonicalName] ?? profile.apiModules;
    if (identity && allowedModules.includes(identity.moduleName)) {
      return (
        identity.importedName === canonicalName ||
        (identity.importedName === 'default' && canonicalName === 'definePlugin') ||
        (identity.importedName === '*' && callName(call) === canonicalName)
      );
    }

    const symbol = checker.getSymbolAtLocation(expression) ?? expression.getSymbol();
    const resolved = symbol?.isAlias() ? symbol.getAliasedSymbol() : symbol;
    const declaration = resolved?.getValueDeclaration() ?? resolved?.getDeclarations()[0];
    const declarationName =
      Node.isNamed(declaration) || Node.isNameable(declaration) ? declaration.getName() : undefined;
    const filePath = declaration?.getSourceFile().getFilePath().replaceAll('\\', '/');
    return Boolean(
      declarationName === canonicalName &&
        (filePath?.endsWith('/src/api/Settings.ts') || filePath?.endsWith('/src/utils/types.ts'))
    );
  } catch {
    return false;
  }
};

export const apiCalls = (
  sourceFiles: readonly SourceFile[],
  name: string,
  profile: SourceProfile,
  checker: TypeChecker
): CallExpression[] =>
  sourceFiles
    .flatMap((sourceFile) => sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression))
    .filter((call) => isApiCall(call, name, profile, checker));

const declarationInitializer = (node: Node, checker: TypeChecker): Node | undefined => {
  try {
    const declaration = resolvedDeclaration(node, checker);
    if (Node.isInitializerExpressionGetable(declaration)) {
      const initializer = declaration.getInitializer();
      if (initializer) return initializer;
    }
  } catch {
    return undefined;
  }
  return undefined;
};

export const resolveNode = (node: Node | undefined, checker: TypeChecker): Node | undefined => {
  if (!node) return undefined;
  const unwrapped = unwrapExpression(node);
  if (unwrapped.isKind(SyntaxKind.Identifier)) {
    const initializer = declarationInitializer(unwrapped, checker);
    return initializer && initializer !== node ? resolveNode(initializer, checker) : unwrapped;
  }
  return unwrapped;
};

export const objectPropertyInitializer = (
  object: ObjectLiteralExpression | undefined,
  name: string
): Node | undefined => {
  const property = object?.getProperty(name);
  return (
    property?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer() ??
    property?.asKind(SyntaxKind.ShorthandPropertyAssignment)?.getNameNode()
  );
};

export const objectArgument = (
  call: CallExpression | undefined
): ObjectLiteralExpression | undefined =>
  call?.getArguments()[0]?.asKind(SyntaxKind.ObjectLiteralExpression);

export const findDefinePluginCall = (
  entry: SourceFile,
  profile: SourceProfile,
  checker: TypeChecker
): CallExpression | undefined =>
  entry
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((call) => isApiCall(call, 'definePlugin', profile, checker));

const findSettingsCallFromNode = (
  node: Node | undefined,
  profile: SourceProfile,
  checker: TypeChecker,
  visited = new Set<string>()
): CallExpression | undefined => {
  const resolved = resolveNode(node, checker);
  if (!resolved) return undefined;
  const key = `${resolved.getSourceFile().getFilePath()}:${resolved.getStart()}`;
  if (visited.has(key)) return undefined;
  visited.add(key);
  const call = resolved.asKind(SyntaxKind.CallExpression);
  if (call) {
    if (isApiCall(call, 'definePluginSettings', profile, checker)) return call;
    const property = call.getExpression().asKind(SyntaxKind.PropertyAccessExpression);
    if (property?.getName() === 'withPrivateSettings')
      return findSettingsCallFromNode(property.getExpression(), profile, checker, visited);
  }
  return undefined;
};

export const findSettingsCall = (
  definePluginCall: CallExpression | undefined,
  sourceFiles: readonly SourceFile[],
  profile: SourceProfile,
  checker: TypeChecker
): CallExpression | undefined => {
  const pluginObject = objectArgument(definePluginCall);
  const referenced = findSettingsCallFromNode(
    objectPropertyInitializer(pluginObject, 'settings'),
    profile,
    checker
  );
  return referenced ?? apiCalls(sourceFiles, 'definePluginSettings', profile, checker)[0];
};

export const settingsBindingsForCall = (call: CallExpression): readonly Node[] => {
  const binding = call.getAncestors().find((ancestor) => {
    if (ancestor.isKind(SyntaxKind.VariableDeclaration))
      return ancestor.getInitializer()?.containsRange(call.getStart(), call.getEnd()) ?? false;
    if (ancestor.isKind(SyntaxKind.PropertyAssignment))
      return ancestor.getInitializer()?.containsRange(call.getStart(), call.getEnd()) ?? false;
    return ancestor.isKind(SyntaxKind.ExportAssignment);
  });
  return binding ? [binding] : [];
};

export const evaluated = (node: Node | undefined, evaluator: StaticEvaluator): unknown => {
  if (!node) return undefined;
  const result = evaluator.evaluate(node);
  return result.known ? result.value : undefined;
};
