import type { Node } from 'ts-morph';
import { SyntaxKind } from 'ts-morph';
import { GLOBAL_ARRAY_NAME, METHOD_NAME_FROM } from '../../constants.js';

export const isArrayFromCall = (call: Node): boolean => {
  if (call.getKind() !== SyntaxKind.CallExpression) return false;
  const propAccess = call
    .asKindOrThrow(SyntaxKind.CallExpression)
    .getExpression()
    .asKind(SyntaxKind.PropertyAccessExpression);
  return (
    propAccess?.getExpression()?.getKind() === SyntaxKind.Identifier &&
    propAccess.getExpression().asKindOrThrow(SyntaxKind.Identifier).getText() ===
      GLOBAL_ARRAY_NAME &&
    propAccess.getName() === METHOD_NAME_FROM
  );
};
