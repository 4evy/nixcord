import { type Node, SyntaxKind, type TypeChecker } from 'ts-morph';
import { resolvedDeclaration } from '../nodes.js';

// Follow callable and JSX targets within the allowed source boundary, excluding
// action callbacks while retaining callbacks that bind setting values
const callableBody = (declaration: Node | undefined): Node | undefined => {
  if (
    declaration?.isKind(SyntaxKind.FunctionDeclaration) ||
    declaration?.isKind(SyntaxKind.MethodDeclaration)
  )
    return declaration.getBody();
  const initializer = declaration?.isKind(SyntaxKind.VariableDeclaration)
    ? declaration.getInitializer()
    : declaration;
  if (
    initializer?.isKind(SyntaxKind.ArrowFunction) ||
    initializer?.isKind(SyntaxKind.FunctionExpression)
  )
    return initializer.getBody();
  return initializer;
};

export const collectTargets = (root: Node, checker: TypeChecker, allowedRoot?: string): Node[] => {
  const queue: Node[] = [root];
  const output: Node[] = [];
  const seen = new Set<string>();
  const sourceMarker = '/src/';
  const sourceMarkerIndex = allowedRoot?.lastIndexOf(sourceMarker) ?? -1;
  const allowedSourceSuffix =
    allowedRoot && sourceMarkerIndex >= 0 ? allowedRoot.slice(sourceMarkerIndex) : undefined;
  const isAllowedSource = (filePath: string): boolean =>
    !allowedRoot ||
    filePath === allowedRoot ||
    filePath.startsWith(`${allowedRoot}/`) ||
    Boolean(
      allowedSourceSuffix &&
        (filePath.endsWith(allowedSourceSuffix) || filePath.includes(`${allowedSourceSuffix}/`))
    );
  const enqueue = (node: Node | undefined): void => {
    if (!node) return;
    if (!isAllowedSource(node.getSourceFile().getFilePath())) return;
    queue.push(node);
  };
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const key = `${current.getSourceFile().getFilePath()}:${current.getStart()}:${current.getEnd()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(current);

    if (
      current.isKind(SyntaxKind.Identifier) ||
      current.isKind(SyntaxKind.PropertyAccessExpression)
    ) {
      const resolvedBody = callableBody(resolvedDeclaration(current, checker));
      if (resolvedBody !== current) enqueue(resolvedBody);
    }
    if (current.isKind(SyntaxKind.ConditionalExpression)) {
      for (const branch of [current.getWhenTrue(), current.getWhenFalse()]) {
        const body = callableBody(resolvedDeclaration(branch, checker));
        enqueue(body);
      }
    }

    for (const jsx of [
      ...current.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
      ...current.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
    ]) {
      if (isActionCallback(jsx)) continue;
      const tag = jsx.getTagNameNode();
      const body = callableBody(resolvedDeclaration(tag, checker));
      enqueue(body);
    }
    const calls = [
      ...(current.isKind(SyntaxKind.CallExpression) ? [current] : []),
      ...current.getDescendantsOfKind(SyntaxKind.CallExpression),
    ];
    for (const call of calls) {
      if (isActionCallback(call)) continue;
      const expression = call.getExpression();
      const body = callableBody(resolvedDeclaration(expression, checker));
      enqueue(body);
      for (const argument of call.getArguments()) {
        if (
          argument.isKind(SyntaxKind.ArrowFunction) ||
          argument.isKind(SyntaxKind.FunctionExpression)
        )
          enqueue(argument.getBody());
        else {
          const argumentBody = callableBody(resolvedDeclaration(argument, checker));
          enqueue(argumentBody);
        }
      }
    }
  }
  return output;
};

const jsxCallbackAttribute = (node: Node): string | undefined => {
  const expression = node.getFirstAncestorByKind(SyntaxKind.JsxExpression);
  const attribute = expression?.getParentIfKind(SyntaxKind.JsxAttribute);
  return attribute?.getNameNode().getText();
};

const SETTING_BINDING_CALLBACKS = new Set([
  'onChange',
  'onInput',
  'onSelect',
  'onValueChange',
  'select',
]);

export const isActionCallback = (node: Node): boolean => {
  const attribute = jsxCallbackAttribute(node);
  if (!attribute || SETTING_BINDING_CALLBACKS.has(attribute)) return false;
  return attribute === 'action' || /^on[A-Z]/.test(attribute);
};

export const isJsxCallback = (node: Node): boolean => jsxCallbackAttribute(node) !== undefined;
