// Nix supplies Discord and its modules, so disable updater downloads
// Still emit completion events: the splash screen and desktop core wait for
// them and would otherwise hang at startup
// Checks report zero updates; installation requests check installed metadata
// Keep localModulesRoot/standaloneModules unset in stock build_info.json:
// upstream isInstalled bypasses metadata/version checks in those modes
//
// Bun runs the TypeScript; Nix supplies the native API by absolute store path
import { bundle, type Rule } from '../bundle.ts';

const [nativePath, filename] = process.argv.slice(2);
if (!nativePath || !filename) {
  throw new Error('Usage: updater/main.ts <native-api.js> <extracted-file.js>');
}
await using patch = await bundle(nativePath, filename);
const { Node, factory, values, one, apply, forEachDescendant } = patch;
// Selectors must match exactly once so upstream changes fail the build
const scope = factory(
  (node) =>
    forEachDescendant(node, (child) =>
      Node.isStringLiteral(child) && child.text === 'legacyModulesUpdater.log' ? true : undefined
    ) === true,
  'legacy updater factory'
);
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
