import { skipOuterExpressions } from '@typescript/native/unstable/ast/is';
import { type Node, SyntaxKind, type TypeChecker } from './ast.js';

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

export const unwrapExpression = (node: Node): Node =>
  node.view.wrap(skipOuterExpressions(node.native))!;
