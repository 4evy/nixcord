// Nix supplies Discord and its modules, so disable updater downloads
// Older hosts need completion events and installed-version checks so their
// splash screen and desktop core do not hang
// Hosts without the legacy updater use disableUpdater from build_info.json
// and need their local module loader pointed at the Nix-staged profile
//
// Bun runs the TypeScript; Nix supplies the native API by absolute store path
import { bundle, type Rule } from '../bundle.ts';

const [nativePath, filename] = process.argv.slice(2);
if (!nativePath || !filename) {
  throw new Error('Usage: updater/main.ts <native-api.js> <extracted-file.js>');
}
await using patch = await bundle(nativePath, filename);
const { Node, SyntaxKind, factory, values, one, apply, forEachDescendant, descendantsOfKind } =
  patch;
// Selectors must match exactly once so upstream changes fail the build
const scope = factory(
  (node) =>
    values(node, 'exports.registerLocalModulePaths').length > 0 ||
    forEachDescendant(node, (child) =>
      Node.isStringLiteral(child) && child.text === 'legacyModulesUpdater.log' ? true : undefined
    ) === true,
  'module loader factory'
);
const localRegistration = values(scope, 'exports.registerLocalModulePaths');
if (localRegistration.length > 0) {
  const registration = one(localRegistration, 'local module registration export');
  const properties = descendantsOfKind(registration, SyntaxKind.PropertyAccessExpression).filter(
    Node.isPropertyAccessExpression
  );
  const resources = one(
    properties.filter((node) => node.name.text === 'getResources'),
    'local module resources lookup'
  );
  const addGlobalPaths = properties.filter((node) => node.name.text === 'addGlobalPath');
  if (addGlobalPaths.length !== 2 || addGlobalPaths[0].getText() !== addGlobalPaths[1].getText()) {
    throw new Error(`${filename}: review changed local module path registration`);
  }
  // Do not set localModulesRoot in build_info.json: legacy hosts use that
  // field to bypass installed-version checks
  const count = await apply([
    {
      name: 'versioned profile path export',
      scope: () =>
        factory(
          (node) => values(node, 'exports.getUserDataVersioned').length > 0,
          'profile paths factory'
        ),
      select: (node) => values(node, 'exports.getUserDataVersioned'),
      expected: 1,
    },
    {
      name: 'local module registration export',
      select: () => localRegistration,
      expected: 1,
      replacement: `function() {
        ${addGlobalPaths[0].getText()}(
          require("path").join(${resources.expression.getText()}.getUserDataVersioned(), "modules")
        );
        return true;
      }`,
    },
  ]);
  console.log(`Patched stock module loader: ${count} expressions`);
} else {
  const plan = {
    flags: { updatable: false, hostUpdatable: false },
    requiredExports: ['isInstalled'],
    exports: {
      // Upstream leaves checkingForUpdates set when both paths are skipped
      // Complete every check without entering that state machine
      checkForUpdates: `function() {
      exports.events.append({ type: exports.CHECKING_FOR_UPDATES });
      exports.events.append({
        type: exports.UPDATE_CHECK_FINISHED,
        succeeded: true, updateCount: 0, manualRequired: false
      });
    }`,
      // The !updatable branch leaves ensureModule unresolved. Report missing
      // packaged versions as failures instead of attempting a download
      install: `function(name, defer, options) {
      if (defer) return;
      exports.events.append({
        type: exports.INSTALLED_MODULE, name, current: 1, total: 1,
        succeeded: Boolean(exports.isInstalled(name, options?.version))
      });
    }`,
      // Never apply downloads left over from an unmanaged profile
      installPendingUpdates: `function() {
      exports.events.append({ type: exports.NO_PENDING_UPDATES });
    }`,
    },
  };
  const init = one(values(scope, 'exports.init'), 'updater init export');
  const rules: Rule[] = [
    ...plan.requiredExports.map((name) => ({
      name: `${name} export`,
      select: () => values(scope, `exports.${name}`),
      expected: 1,
    })),
    ...Object.entries(plan.flags).map(([name, enabled]) => ({
      name: `${name} flag`,
      select: () => values(init, name),
      expected: 1,
      replacement: String(enabled),
    })),
    ...Object.entries(plan.exports).map(([name, source]) => ({
      name: `${name} export`,
      select: () => values(scope, `exports.${name}`),
      expected: 1,
      replacement: source,
    })),
  ];
  const count = await apply(rules);
  console.log(`Patched stock updater: ${count} expressions`);
}
