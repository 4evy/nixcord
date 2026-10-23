import { readFileSync, writeFileSync } from 'node:fs';
import type { Expression } from 'typescript/unstable/ast';
import { bundle } from '../bundle.ts';

const [nativePath, mode, filename, runtimePath, buildInfo, modulesRoot] = process.argv.slice(2);
if (
  !nativePath ||
  !filename ||
  !['voice', 'index'].includes(mode ?? '') ||
  (mode === 'voice' && (!runtimePath || Boolean(buildInfo) !== Boolean(modulesRoot))) ||
  (mode === 'index' && runtimePath)
) {
  throw new Error(
    'Usage: krisp/main.ts <native-api.js> <voice|index> <index.js> ' +
      '[<runtime-path-js> [<build-info.json> <modules-root>]]'
  );
}
const metadata = buildInfo ? JSON.parse(readFileSync(buildInfo, 'utf8')) : undefined;
if (
  metadata !== undefined &&
  (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
) {
  throw new Error(`${buildInfo}: expected a build-info object`);
}
await using patch = await bundle(nativePath, filename, mode === 'voice' ? [runtimePath!] : []);
const {
  Node,
  nodeFactory: f,
  parsedExpressions,
  SyntaxKind,
  values,
  referenceName,
  apply,
  descendantsOfKind,
  parentOf,
  firstAncestor,
} = patch;
const member = (receiver: string | Expression, name: string) =>
  f.createPropertyAccessExpression(
    typeof receiver === 'string' ? f.createIdentifier(receiver) : receiver,
    undefined,
    f.createIdentifier(name),
    Node.NodeFlags.None
  );
const call = (expression: Expression, args: readonly Expression[]) =>
  f.createExpressionStatement(
    f.createCallExpression(expression, undefined, undefined, args, Node.NodeFlags.None)
  );
const assign = (left: Expression, right: Expression) =>
  f.createExpressionStatement(
    f.createBinaryExpression(
      undefined,
      left,
      undefined,
      f.createToken(SyntaxKind.EqualsToken),
      right
    )
  );
const string = (text: string) => f.createStringLiteral(text, Node.TokenFlags.None);
if (mode === 'voice') {
  const setKrispPath = () =>
    call(member('VoiceEngine', 'setKrispPath'), [f.createIdentifier('nixKrispPath')]);
  await apply([
    {
      name: 'voice Krisp setup statement',
      select: (scope) =>
        values(scope, 'VoiceEngine.setupKrispPath')
          .filter(
            (node) =>
              Node.isFunctionExpression(node) &&
              descendantsOfKind(node, SyntaxKind.CallExpression)
                .filter(Node.isCallExpression)
                .some(
                  (call) =>
                    referenceName(call.expression) ===
                      'discordNative.nativeModules.getModulePath' &&
                    call.arguments.some(
                      (arg) => Node.isStringLiteral(arg) && arg.text === 'discord_krisp'
                    )
                )
          )
          .map((node) =>
            parentOf(parentOf(node, SyntaxKind.BinaryExpression), SyntaxKind.ExpressionStatement)
          ),
      expected: 1,
      replacement: [
        f.createVariableStatement(
          undefined,
          f.createVariableDeclarationList(
            [
              f.createVariableDeclaration(
                f.createIdentifier('nixKrispPath'),
                undefined,
                undefined,
                parsedExpressions[0]
              ),
            ],
            Node.NodeFlags.Const
          )
        ),
        f.createTryStatement(
          f.createBlock(
            [call(f.createIdentifier('require'), [f.createIdentifier('nixKrispPath')])],
            true
          ),
          f.createCatchClause(
            f.createVariableDeclaration(f.createIdentifier('e')),
            f.createBlock(
              [
                call(member('console', 'warn'), [
                  string('Failed to initialize Krisp via Node module before voice engine setup:'),
                  f.createIdentifier('e'),
                ]),
              ],
              true
            )
          )
        ),
        setKrispPath(),
        assign(
          member('VoiceEngine', 'setupKrispPath'),
          f.createFunctionExpression(
            undefined,
            undefined,
            undefined,
            undefined,
            [],
            undefined,
            f.createBlock([setKrispPath()], true)
          )
        ),
      ],
    },
  ]);
  if (metadata !== undefined) {
    metadata.localModulesRoot = modulesRoot;
    writeFileSync(buildInfo!, `${JSON.stringify(metadata, null, 2)}\n`);
  }
} else {
  const initialized = () => member(member('process', 'env'), 'NIXPKGS_KRISP_INITIALIZED');
  await apply([
    {
      name: 'Krisp module initialization statement',
      select: (scope) =>
        descendantsOfKind(scope, SyntaxKind.CallExpression)
          .filter(Node.isCallExpression)
          .filter(
            (node) =>
              referenceName(node.expression) === 'KrispModule._initialize' &&
              node.arguments.length === 1 &&
              Node.isIdentifier(node.arguments[0]) &&
              node.arguments[0].text === 'initializationParams'
          )
          .map((node) => parentOf(node, SyntaxKind.ExpressionStatement)),
      expected: 1,
      replacement: (node) => {
        // Preserve the guard when a module is post-processed again
        const guard = firstAncestor(node, SyntaxKind.IfStatement);
        const condition = guard && Node.isIfStatement(guard) ? guard.expression : undefined;
        if (condition && Node.isBinaryExpression(condition)) {
          const right = condition.right;
          if (
            referenceName(condition.left) === 'process.env.NIXPKGS_KRISP_INITIALIZED' &&
            condition.operatorToken.kind === SyntaxKind.ExclamationEqualsEqualsToken &&
            Node.isStringLiteral(right) &&
            right.text === '1'
          ) {
            return undefined;
          }
        }
        if (!Node.isExpressionStatement(node)) throw new Error('Expected initialization statement');
        return f.createIfStatement(
          f.createBinaryExpression(
            undefined,
            initialized(),
            undefined,
            f.createToken(SyntaxKind.ExclamationEqualsEqualsToken),
            string('1')
          ),
          f.createBlock([node, assign(initialized(), string('1'))], true)
        );
      },
    },
  ]);
}
