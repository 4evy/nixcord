import * as ast from '@typescript/native/ast';
import { visitEachChild } from '@typescript/native/ast/visitor';
import type { Node } from './ast.js';

export async function unexportedText(node: Node): Promise<string> {
  if (ast.isExportAssignment(node.native)) return node.native.expression.getText();
  const native = node.native;
  if (ast.isInterfaceDeclaration(native) || ast.isTypeAliasDeclaration(native)) return '';
  if (
    !ast.isVariableStatement(native) &&
    !ast.isFunctionDeclaration(native) &&
    !ast.isClassDeclaration(native) &&
    !ast.isEnumDeclaration(native)
  )
    return node.getText();
  const updated = visitEachChild(native, (child) =>
    child.kind === ast.SyntaxKind.ExportKeyword || child.kind === ast.SyntaxKind.DefaultKeyword
      ? undefined
      : child
  );
  if (!node.view.printNode) throw new Error('Source printing requires an active analysis session');
  return node.view.printNode(updated);
}
