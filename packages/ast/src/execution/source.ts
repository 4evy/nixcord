import { type Node, SyntaxKind, ts } from 'ts-morph';

// Print selected declarations and allocate collision-free wrapper names
const sourcePrinter = ts.createPrinter();
const unexportedText = (node: Node): string => {
  if (node.isKind(SyntaxKind.ExportAssignment)) return node.getExpression().getText();
  const compilerNode = node.compilerNode;
  if (!ts.canHaveModifiers(compilerNode)) return node.getText();
  const modifiers = ts
    .getModifiers(compilerNode)
    ?.filter(
      (modifier) =>
        modifier.kind !== SyntaxKind.ExportKeyword && modifier.kind !== SyntaxKind.DefaultKeyword
    );
  return sourcePrinter.printNode(
    ts.EmitHint.Unspecified,
    ts.factory.replaceModifiers(compilerNode, modifiers),
    node.getSourceFile().compilerNode
  );
};

export const componentExpressionText = (component: Node): string => {
  const variable = component.asKind(SyntaxKind.VariableDeclaration);
  if (variable) return variable.getInitializerOrThrow().getText();
  const method = component.asKind(SyntaxKind.MethodDeclaration);
  if (method) {
    const parameters = method.getParameters().map((parameter) => parameter.getText());
    return `function (${parameters.join(', ')}) ${method.getBodyOrThrow().getText()}`;
  }
  return unexportedText(component);
};

export const executableText = (node: Node, defaultName: string): string => {
  const exportAssignment = node.asKind(SyntaxKind.ExportAssignment);
  if (exportAssignment)
    return `const ${defaultName} = (${exportAssignment.getExpression().getText()});`;
  return unexportedText(node);
};

export const uniqueNameFactory = (nodes: readonly Node[]) => {
  const occupied = new Set(
    nodes.flatMap((node) => [
      ...(node.isKind(SyntaxKind.Identifier) ? [node.getText()] : []),
      ...node.getDescendantsOfKind(SyntaxKind.Identifier).map((identifier) => identifier.getText()),
    ])
  );
  return (base: string): string => {
    let candidate = base;
    let suffix = 0;
    while (occupied.has(candidate)) candidate = `${base}${++suffix}`;
    occupied.add(candidate);
    return candidate;
  };
};
