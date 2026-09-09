// Nix owns the installed Discord host and module versions. Disable downloads,
// but keep answering updater requests: the splash screen and desktop core wait
// for completion events, so simply returning can leave startup stuck.
// Checks report zero updates; installation requests check installed metadata.
// Keep localModulesRoot/standaloneModules unset in stock build_info.json:
// upstream isInstalled bypasses metadata/version checks in those modes.
//
// Node strips the types; Nix supplies the compiler API by absolute store path:
//   node patch-updater.cts <typescript.js> <stock|openasar> <extracted-file.js>
import type * as TS from 'typescript';

const fs: typeof import('node:fs') = require('node:fs');
const [compilerPath, mode, filename] = process.argv.slice(2);
if (!compilerPath || !filename || (mode !== 'stock' && mode !== 'openasar')) {
  throw new Error('Usage: patch-updater.cts <typescript.js> <stock|openasar> <file>');
}
const ts: typeof TS = require(compilerPath);

type Predicate<T extends TS.Node> = (node: TS.Node) => node is T;
type PatchPlan = {
  scope: TS.Node;
  flags: Record<string, boolean>; // Inside exports.init.
  requiredExports?: readonly string[];
  exports: Record<string, string>;
  append?: Record<string, string | boolean>;
};

function parse(name: string, source: string): TS.SourceFile {
  const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const options: TS.CompilerOptions = { allowJs: true, noLib: true, noResolve: true };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = (path) => (path === name ? file : undefined);
  const diagnostics = ts.createProgram([name], options, host).getSyntacticDiagnostics(file);
  if (diagnostics.length) throw new Error(ts.formatDiagnostics(diagnostics, host));
  return file;
}

function find<T extends TS.Node>(root: TS.Node, predicate: Predicate<T>): T[] {
  const matches: T[] = [];
  function visit(node: TS.Node): void {
    if (predicate(node)) matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(root);
  return matches;
}

function one<T>(nodes: readonly T[], description: string): T {
  if (nodes.length !== 1) {
    throw new Error(`${filename}: expected one ${description}, found ${nodes.length}`);
  }
  return nodes[0];
}

const file = parse(filename, fs.readFileSync(filename, 'utf8'));
// Computed properties are intentionally unsupported: changed upstream syntax
// should prompt a review of the selector and event protocol.
function referenceName(node: TS.Node): string | undefined {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) {
    const receiver = referenceName(node.expression);
    if (receiver !== undefined) return `${receiver}.${node.name.text}`;
  }
  return undefined;
}

function value(root: TS.Node, name: string): TS.Expression {
  const node = one(
    find(
      root,
      (node): node is TS.BinaryExpression | TS.VariableDeclaration =>
        (ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          referenceName(node.left) === name) ||
        (ts.isVariableDeclaration(node) && referenceName(node.name) === name)
    ),
    `${name} value`
  );
  const result = ts.isVariableDeclaration(node) ? node.initializer : node.right;
  if (!result) throw new Error(`Missing ${name} initializer`);
  return result;
}
function exported(root: TS.Node, name: string): TS.Expression {
  return value(root, `exports.${name}`);
}

// Selectors must match exactly once so upstream changes fail the build.
const plans: Record<'stock' | 'openasar', () => PatchPlan> = {
  stock: () => ({
    // Webpack's numeric factory IDs change. Locate the object method containing
    // this logger filename instead, then restrict export searches to it.
    scope: one(
      find(
        file,
        (node): node is TS.MethodDeclaration =>
          ts.isMethodDeclaration(node) &&
          ts.isObjectLiteralExpression(node.parent) &&
          find(
            node,
            (child): child is TS.StringLiteral =>
              ts.isStringLiteral(child) && child.text === 'legacyModulesUpdater.log'
          ).length > 0
      ),
      'legacy updater factory'
    ),
    flags: { updatable: false, hostUpdatable: false },
    requiredExports: ['isInstalled'],
    exports: {
      // Upstream leaves checkingForUpdates set when both paths are skipped.
      // Complete every check without entering that state machine.
      checkForUpdates: `function() {
        exports.events.append({ type: exports.CHECKING_FOR_UPDATES });
        exports.events.append({
          type: exports.UPDATE_CHECK_FINISHED,
          succeeded: true, updateCount: 0, manualRequired: false
        });
      }`,
      // The !updatable branch leaves ensureModule unresolved. Report missing
      // packaged versions as failures instead of attempting a download.
      install: `function(name, defer, options) {
        if (defer) return;
        exports.events.append({
          type: exports.INSTALLED_MODULE, name, current: 1, total: 1,
          succeeded: Boolean(exports.isInstalled(name, options?.version))
        });
      }`,
      // Never apply downloads left over from an unmanaged profile.
      installPendingUpdates: `function() {
        exports.events.append({ type: exports.NO_PENDING_UPDATES });
      }`,
    },
  }),
  openasar: () => ({
    scope: file,
    flags: { skipHost: true, skipModule: true },
    exports: {
      isInstalled: `(name, version) =>
        Object.hasOwn(installed, name) && installed[name].installedVersion > 0
        && (version == null || installed[name].installedVersion === version)`,
      install: `(name, defer, options) => {
        if (defer) return;
        process.nextTick(() => events.emit('installed-module', {
          type: 'installed-module', name, current: 1, total: 1,
          succeeded: exports.isInstalled(name, options?.version)
        }));
      }`,
      checkForUpdates: `async () => {
        events.emit(exports.CHECKING_FOR_UPDATES);
        events.emit(exports.UPDATE_CHECK_FINISHED, {
          succeeded: true, updateCount: 0, manualRequired: false
        });
        // OpenASAR's splash uses its own completion event.
        events.emit('checked', { failed: false, count: 0 });
      }`,
    },
    // Desktop core otherwise interprets event objects as positional arguments.
    append: {
      supportsEventObjects: true,
      CHECKING_FOR_UPDATES: 'checking-for-updates',
      UPDATE_CHECK_FINISHED: 'update-check-finished',
      DOWNLOADING_MODULE_PROGRESS: 'downloading-module-progress',
      DOWNLOADING_MODULES_FINISHED: 'downloading-modules-finished',
    },
  }),
};

function expression(source: string): TS.Expression {
  const snippet = parse('replacement.js', `(${source});`);
  const statement = one(snippet.statements, 'replacement statement');
  if (!ts.isExpressionStatement(statement) || !ts.isParenthesizedExpression(statement.expression)) {
    throw new Error('Replacement must be an expression');
  }
  // These nodes belong to a different source file. Mark them synthetic so the
  // printer doesn't reuse positions or comments from the original bundle.
  function synthesize(node: TS.Node): void {
    ts.setTextRange(node, { pos: -1, end: -1 });
    ts.forEachChild(node, synthesize);
  }
  const result = statement.expression.expression;
  synthesize(result);
  return result;
}

function literal(value: string | boolean): TS.Expression {
  return typeof value === 'string'
    ? ts.factory.createStringLiteral(value)
    : value
      ? ts.factory.createTrue()
      : ts.factory.createFalse();
}

const plan = plans[mode]();
const replacements = new Map<TS.Node, TS.Expression>();
const init = exported(plan.scope, 'init');
for (const name of plan.requiredExports ?? []) exported(plan.scope, name);
for (const [name, enabled] of Object.entries(plan.flags)) {
  replacements.set(value(init, name), literal(enabled));
}
for (const [name, source] of Object.entries(plan.exports)) {
  replacements.set(exported(plan.scope, name), expression(source));
}
const additions = Object.entries(plan.append ?? {}).map(([name, value]) =>
  ts.factory.createExpressionStatement(
    ts.factory.createAssignment(
      ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('exports'), name),
      literal(value)
    )
  )
);

// Reject overlapping patches: replacing an outer function can hide a selected
// node inside it, leaving that replacement unapplied.
const remaining = new Set(replacements.keys());
const printer = ts.createPrinter(
  {},
  {
    substituteNode: (_hint, node) => {
      const replacement = replacements.get(node);
      if (!replacement) return node;
      remaining.delete(node);
      return replacement;
    },
  }
);
const result = printer.printFile(
  ts.factory.updateSourceFile(file, [...file.statements, ...additions])
);
if (remaining.size) throw new Error('Overlapping or unapplied updater patches');
// Validate before writing. Syntax/selector checks cannot prove that an upstream
// release still uses the same event protocol; inspect callers when updating it.
parse(filename, result);
fs.writeFileSync(filename, result);
console.log(
  `Patched ${mode} updater: ${replacements.size} expressions, ${additions.length} exports`
);
