import * as ast from '@typescript/native/unstable/ast';
import * as factory from '@typescript/native/unstable/ast/factory';
import type { Node } from './ast.js';

export async function unexportedText(node: Node): Promise<string> {
  if (ast.isExportAssignment(node.native)) return node.native.expression.getText();
  const native = node.native;
  if (ast.isInterfaceDeclaration(native) || ast.isTypeAliasDeclaration(native)) return '';
  const modifiers = (
    'modifiers' in native
      ? (native.modifiers as readonly ast.ModifierLike[] | undefined)
      : undefined
  )?.filter(
    (m) => m.kind !== ast.SyntaxKind.ExportKeyword && m.kind !== ast.SyntaxKind.DefaultKeyword
  );
  let updated: ast.Node = native;
  if (ast.isVariableStatement(native))
    updated = factory.updateVariableStatement(native, modifiers, native.declarationList);
  else if (ast.isFunctionDeclaration(native))
    updated = factory.updateFunctionDeclaration(
      native,
      modifiers,
      native.asteriskToken,
      native.name,
      native.typeParameters,
      native.parameters,
      native.type,
      native.body
    );
  else if (ast.isClassDeclaration(native))
    updated = factory.updateClassDeclaration(
      native,
      modifiers,
      native.name,
      native.typeParameters,
      native.heritageClauses,
      native.members
    );
  else if (ast.isEnumDeclaration(native))
    updated = factory.updateEnumDeclaration(native, modifiers, native.name, native.members);
  else return node.getText();
  if (!node.view.printNode) throw new Error('Source printing requires an active analysis session');
  return node.view.printNode(updated);
}
