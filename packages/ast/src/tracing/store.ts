import { type Node, SyntaxKind, type TypeChecker } from 'ts-morph';
import type { StaticEvaluator, StaticValue } from '../evaluator.js';
import { resolvedDeclaration } from '../nodes.js';

// Resolve settings identity, static store paths, and local aliases without
// treating unrelated objects with similarly named properties as settings
const staticKey = (
  node: Node | undefined,
  evaluator: StaticEvaluator,
  bindings: ReadonlyMap<string, StaticValue>
): string | undefined => {
  if (!node) return undefined;
  const result = evaluator.evaluate(node, bindings);
  return result.known && (typeof result.value === 'string' || typeof result.value === 'number')
    ? String(result.value)
    : undefined;
};

const nodeKey = (node: Node): string =>
  `${node.getSourceFile().getFilePath()}:${node.getStart()}:${node.getEnd()}`;

const bindingName = (node: Node): string | undefined => {
  if (node.isKind(SyntaxKind.VariableDeclaration)) return node.getName();
  if (node.isKind(SyntaxKind.PropertyAssignment)) return node.getName();
  return undefined;
};

const importedName = (node: Node): string | undefined => {
  if (!node.isKind(SyntaxKind.Identifier)) return undefined;
  const localName = node.getText();
  for (const declaration of node.getSourceFile().getImportDeclarations()) {
    const named = declaration
      .getNamedImports()
      .find(
        (specifier) => (specifier.getAliasNode()?.getText() ?? specifier.getName()) === localName
      );
    if (named) return named.getName();
  }
  return undefined;
};

export const isSettingsObject = (
  node: Node,
  checker: TypeChecker,
  settingsBindings: readonly Node[],
  visited = new Set<string>()
): boolean => {
  if (settingsBindings.length === 0) return node.getText() === 'settings';
  const bindingKeys = new Set(settingsBindings.map(nodeKey));
  const key = nodeKey(node);
  if (visited.has(key)) return false;
  visited.add(key);
  if (bindingKeys.has(key)) return true;
  const importName = importedName(node);
  if (importName && settingsBindings.some((binding) => bindingName(binding) === importName))
    return true;
  const declaration = resolvedDeclaration(node, checker);
  if (
    !declaration &&
    node.isKind(SyntaxKind.Identifier) &&
    settingsBindings.some((binding) => {
      const name = bindingName(binding);
      return name === node.getText();
    })
  )
    return true;
  if (!declaration) return false;
  if (bindingKeys.has(nodeKey(declaration))) return true;
  if (declaration.isKind(SyntaxKind.VariableDeclaration)) {
    const initializer = declaration.getInitializer();
    return initializer ? isSettingsObject(initializer, checker, settingsBindings, visited) : false;
  }
  return false;
};

export const storePath = (
  node: Node,
  evaluator: StaticEvaluator,
  checker: TypeChecker,
  settingsBindings: readonly Node[],
  bindings: ReadonlyMap<string, StaticValue> = new Map(),
  aliases: ReadonlyMap<string, readonly string[]> = new Map()
): string[] | undefined => {
  const parts: string[] = [];
  let current: Node = node;
  while (true) {
    if (
      current.isKind(SyntaxKind.ParenthesizedExpression) ||
      current.isKind(SyntaxKind.AsExpression) ||
      current.isKind(SyntaxKind.TypeAssertionExpression) ||
      current.isKind(SyntaxKind.NonNullExpression) ||
      current.isKind(SyntaxKind.SatisfiesExpression)
    ) {
      current = current.getExpression();
      continue;
    }
    const storeProperty = current.asKind(SyntaxKind.PropertyAccessExpression);
    if (
      storeProperty?.getName() === 'store' &&
      isSettingsObject(storeProperty.getExpression(), checker, settingsBindings)
    )
      return parts;
    const storeElement = current.asKind(SyntaxKind.ElementAccessExpression);
    if (
      storeElement &&
      staticKey(storeElement.getArgumentExpression(), evaluator, bindings) === 'store' &&
      isSettingsObject(storeElement.getExpression(), checker, settingsBindings)
    )
      return parts;
    if (current.isKind(SyntaxKind.PropertyAccessExpression)) {
      parts.unshift(current.getName());
      current = current.getExpression();
      continue;
    }
    if (current.isKind(SyntaxKind.ElementAccessExpression)) {
      const key = staticKey(current.getArgumentExpression(), evaluator, bindings);
      if (key === undefined) return undefined;
      parts.unshift(key);
      current = current.getExpression();
      continue;
    }
    break;
  }
  const alias = current.asKind(SyntaxKind.Identifier) ? aliases.get(current.getText()) : undefined;
  return alias ? [...alias, ...parts] : undefined;
};

export const storeAliases = (
  node: Node,
  evaluator: StaticEvaluator,
  checker: TypeChecker,
  settingsBindings: readonly Node[],
  bindings: ReadonlyMap<string, StaticValue> = new Map()
): Map<string, readonly string[]> => {
  const aliases = new Map<string, readonly string[]>();
  for (const declaration of node.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const initializer = declaration.getInitializer();
    if (!initializer) continue;
    let unwrapped = initializer;
    while (
      unwrapped.isKind(SyntaxKind.ParenthesizedExpression) ||
      unwrapped.isKind(SyntaxKind.AsExpression) ||
      unwrapped.isKind(SyntaxKind.TypeAssertionExpression) ||
      unwrapped.isKind(SyntaxKind.NonNullExpression) ||
      unwrapped.isKind(SyntaxKind.SatisfiesExpression)
    )
      unwrapped = unwrapped.getExpression();
    const assignment = unwrapped.asKind(SyntaxKind.BinaryExpression);
    const source =
      assignment &&
      [
        SyntaxKind.EqualsToken,
        SyntaxKind.QuestionQuestionEqualsToken,
        SyntaxKind.BarBarEqualsToken,
      ].includes(assignment.getOperatorToken().getKind())
        ? assignment.getLeft()
        : unwrapped;
    const path = storePath(source, evaluator, checker, settingsBindings, bindings, aliases);
    if (path) aliases.set(declaration.getName(), path);
  }
  return aliases;
};
