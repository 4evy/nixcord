import { argv } from 'node:process';

type Dependencies = Record<string, string>;
type Metadata = {
  dependencies?: Dependencies;
  optionalDependencies?: Dependencies;
  peerDependencies?: Dependencies;
};

const name = argv[2];
if (!name) throw new Error('Expected the client package name');
const project: { overrides?: Record<string, Dependencies> } = await Bun.file('package.json').json();
const overrides: Dependencies = project.overrides?.[name] ?? {};
const file = Bun.file('bun.lock');
const lock = Bun.JSONC.parse(await file.text()) as {
  packages: Record<string, [string, Metadata, string]>;
};
const metadata = lock.packages[name]?.[1];
if (!metadata) throw new Error(`Missing archive lock entry for ${name}`);
let changed = false;

// Bun 1.4.3 applies overrides when resolving an archive but leaves catalog:
// in its lock metadata, which the frozen-lockfile reader cannot load
for (const group of ['dependencies', 'optionalDependencies', 'peerDependencies'] as const) {
  for (const [dependency, version] of Object.entries(metadata[group] ?? {})) {
    if (!version.startsWith('catalog:')) continue;
    const resolved = overrides[dependency];
    if (!resolved) throw new Error(`Missing ${name} override for ${dependency}`);
    metadata[group]![dependency] = resolved;
    changed = true;
  }
}
if (changed) await Bun.write(file, `${JSON.stringify(lock, null, 2)}\n`);
