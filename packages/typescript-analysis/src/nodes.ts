import * as ast from '@typescript/native/ast';
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

export const unwrapExpression = (node: Node): Node => {
  let native = node.native;
  // TypeScript 7.1 keeps skipOuterExpressions internal, so use public guards
  while (
    ast.isParenthesizedExpression(native) ||
    ast.isTypeAssertion(native) ||
    ast.isAsExpression(native) ||
    ast.isSatisfiesExpression(native) ||
    ast.isExpressionWithTypeArguments(native) ||
    ast.isNonNullExpression(native) ||
    ast.isPartiallyEmittedExpression(native)
  )
    native = native.expression;
  return node.view.wrap(native);
};
