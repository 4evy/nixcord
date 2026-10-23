// Autostart, first-run links and relaunch must enter the public Nix launcher
// Do not change process.execPath globally: native code uses its sibling files
import { bundle, type Rule } from '../bundle.ts';

const [nativePath, kind, filename, launcher] = process.argv.slice(2);
if (!nativePath || !filename || !launcher?.startsWith('/') || !['host', 'core'].includes(kind)) {
  throw new Error(
    'Usage: launcher/main.ts <native-api.js> <host|core> <bundle.js> <absolute-launcher>'
  );
}
await using patch = await bundle(nativePath, filename);
const {
  Node,
  SyntaxKind,
  factory,
  values,
  one,
  referenceName,
  apply,
  descendantsOfKind,
  forEachDescendant,
  expectKind,
} = patch;
const launcherLiteral = JSON.stringify(launcher);
const executableReferences = (scope: import('typescript/unstable/ast').Node) =>
  descendantsOfKind(scope, SyntaxKind.PropertyAccessExpression).filter(
    (node) => referenceName(node) === 'process.execPath'
  );
const autostart = () =>
  factory(
    (node) =>
      forEachDescendant(node, (child) =>
        Node.isTemplateTail(child) && child.text.includes('X-GNOME-Autostart-enabled=true')
          ? true
          : undefined
      ) === true,
    'Linux autostart factory'
  );
const firstRun = () =>
  factory(
    (node) =>
      values(node, 'exports.performFirstRunTasks').length > 0 &&
      descendantsOfKind(node, SyntaxKind.CallExpression)
        .filter(Node.isCallExpression)
        .some((child) => referenceName(child.expression)?.endsWith('.symlinkSync')),
    'Linux first-run factory'
  );
const hostRules: Rule[] = [
  {
    name: 'autostart executable',
    scope: autostart,
    select: (scope) => values(scope, 'exePath'),
    expected: 1,
    replacement: (node) => {
      const call = expectKind(
        node,
        SyntaxKind.CallExpression
      ) as import('typescript/unstable/ast').CallExpression;
      const argument = one(call.arguments, 'autostart executable argument');
      if (
        !referenceName(call.expression)?.endsWith('.app.getPath') ||
        !Node.isStringLiteral(argument) ||
        argument.text !== 'exe'
      ) {
        throw new Error(`${filename}: review changed autostart executable lookup`);
      }
      return launcherLiteral;
    },
  },
  {
    name: 'autostart executable-name reference',
    scope: autostart,
    select: executableReferences,
    expected: 1,
    replacement: launcherLiteral,
  },
  {
    name: 'first-run executable references',
    scope: firstRun,
    select: executableReferences,
    expected: 2,
    replacement: launcherLiteral,
  },
];
// Preserve wrapper/user arguments; new upstream options require review
const relaunch: Rule = {
  name: 'app.relaunch calls',
  select: (scope) =>
    descendantsOfKind(scope, SyntaxKind.CallExpression)
      .filter(Node.isCallExpression)
      .filter((node) => {
        const name = referenceName(node.expression);
        return name === 'app.relaunch' || name?.endsWith('.app.relaunch') === true;
      }),
  expected: kind === 'host' ? 3 : 4,
  replacement: (node) => {
    const call = expectKind(
      node,
      SyntaxKind.CallExpression
    ) as import('typescript/unstable/ast').CallExpression;
    if (call.arguments.length) throw new Error(`${filename}: review new app.relaunch options`);
    return `${call.expression.getText()}({ execPath: ${launcherLiteral}, args: process.argv.slice(1) })`;
  },
};
const count = await apply([...(kind === 'host' ? hostRules : []), relaunch]);
console.log(`Patched ${kind} launcher: ${count} expressions`);
