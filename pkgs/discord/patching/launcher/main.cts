// Autostart, first-run links and relaunch must enter the public Nix launcher
// Do not change process.execPath globally: native code uses its sibling files
import type { Rule } from '../bundle.cts';

const bundle: import('../bundle.cts').Bundle = require('../bundle.cts');
const [morphPath, kind, filename, launcher] = process.argv.slice(2);
if (!morphPath || !filename || !launcher?.startsWith('/') || !['host', 'core'].includes(kind)) {
  throw new Error(
    'Usage: launcher/main.cts <ts-morph.js> <host|core> <bundle.js> <absolute-launcher>'
  );
}
const { Node, SyntaxKind, factory, values, one, referenceName, apply } = bundle(
  morphPath,
  filename
);
const launcherLiteral = JSON.stringify(launcher);
const executableReferences = (scope: import('ts-morph').Node) =>
  scope
    .getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)
    .filter((node) => referenceName(node) === 'process.execPath');
const autostart = () =>
  factory(
    (node) =>
      node.forEachDescendant((child) =>
        Node.isTemplateTail(child) &&
        child.getLiteralText().includes('X-GNOME-Autostart-enabled=true')
          ? true
          : undefined
      ) === true,
    'Linux autostart factory'
  );
const firstRun = () =>
  factory(
    (node) =>
      values(node, 'exports.performFirstRunTasks').length > 0 &&
      node
        .getDescendantsOfKind(SyntaxKind.CallExpression)
        .some((child) => referenceName(child.getExpression())?.endsWith('.symlinkSync')),
    'Linux first-run factory'
  );

const hostRules: Rule[] = [
  {
    name: 'autostart executable',
    scope: autostart,
    select: (scope) => values(scope, 'exePath'),
    expected: 1,
    replacement: (node) => {
      const call = node.asKindOrThrow(SyntaxKind.CallExpression);
      const argument = one(call.getArguments(), 'autostart executable argument');
      if (
        !referenceName(call.getExpression())?.endsWith('.app.getPath') ||
        !Node.isStringLiteral(argument) ||
        argument.getLiteralValue() !== 'exe'
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
    scope.getDescendantsOfKind(SyntaxKind.CallExpression).filter((node) => {
      const name = referenceName(node.getExpression());
      return name === 'app.relaunch' || name?.endsWith('.app.relaunch') === true;
    }),
  expected: kind === 'host' ? 3 : 4,
  replacement: (node) => {
    const call = node.asKindOrThrow(SyntaxKind.CallExpression);
    if (call.getArguments().length) throw new Error(`${filename}: review new app.relaunch options`);
    return `${call.getExpression().getText()}({ execPath: ${launcherLiteral}, args: process.argv.slice(1) })`;
  },
};
const count = apply([...(kind === 'host' ? hostRules : []), relaunch]);
console.log(`Patched ${kind} launcher: ${count} expressions`);
