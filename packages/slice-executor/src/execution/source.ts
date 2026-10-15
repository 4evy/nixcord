import { type Node, SyntaxKind, unexportedText } from '@nixcord/typescript-analysis';

export const componentExpressionText = async (component: Node): Promise<string> => {
  const variable = component.asKind(SyntaxKind.VariableDeclaration);
  if (variable) return variable.getInitializerOrThrow().getText();
  const method = component.asKind(SyntaxKind.MethodDeclaration);
  if (method) {
    const parameters = method.getParameters().map((parameter) => parameter.getText());
    return `function (${parameters.join(', ')}) ${method.getBodyOrThrow().getText()}`;
  }
  return unexportedText(component);
};

export const executableText = async (node: Node, defaultName: string): Promise<string> => {
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
