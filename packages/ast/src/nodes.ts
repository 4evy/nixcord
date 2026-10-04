import { type Node, SyntaxKind, type TypeChecker } from 'ts-morph';

export const resolvedDeclaration = (node: Node, checker: TypeChecker): Node | undefined => {
  try {
    const shorthand = node.getParentIfKind(SyntaxKind.ShorthandPropertyAssignment);
    const symbol =
      (shorthand && checker.getShorthandAssignmentValueSymbol(shorthand)) ??
      checker.getSymbolAtLocation(node) ??
      node.getSymbol();
    const resolved = symbol?.isAlias() ? symbol.getAliasedSymbol() : symbol;
    return resolved?.getValueDeclaration() ?? resolved?.getDeclarations()[0];
  } catch {
    return undefined;
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
