import { join } from 'node:path';

type Dependencies = Record<string, string>;
type Manifest = {
  name: string;
  dependencies?: Dependencies;
  devDependencies?: Dependencies;
  optionalDependencies?: Dependencies;
  peerDependencies?: Dependencies;
  overrides?: Record<string, Dependencies>;
};
type Workspace = {
  catalog?: Dependencies;
  catalogs?: Record<string, Dependencies>;
};

const [source = '.', consumer] = process.argv.slice(2);
const file = Bun.file(join(source, 'package.json'));
const manifest: Manifest = await file.json();
const workspaceFile = Bun.file(join(source, 'pnpm-workspace.yaml'));
const workspace: Workspace = (await workspaceFile.exists())
  ? (Bun.YAML.parse(await workspaceFile.text()) as Workspace)
  : {};
const overrides: Dependencies = {};

// Bun does not import pnpm catalogs when an existing Bun lockfile is present
for (const group of [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
] as const) {
  for (const [name, version] of Object.entries(manifest[group] ?? {})) {
    if (!version.startsWith('catalog:')) continue;
    const catalogName = version.slice('catalog:'.length);
    const catalog =
      catalogName && catalogName !== 'default'
        ? workspace.catalogs?.[catalogName]
        : (workspace.catalog ?? workspace.catalogs?.default);
    const resolved = catalog?.[name];
    if (!resolved) throw new Error(`Missing ${version} entry for ${name}`);
    manifest[group]![name] = resolved;
    if (group !== 'devDependencies') {
      overrides[name] = resolved;
    }
  }
}

if (consumer) {
  // GitHub archives are not packed by pnpm and retain catalog: dependencies
  // Scope overrides to the source package so the two clients can differ
  const consumerFile = Bun.file(consumer);
  const project: Manifest = await consumerFile.json();
  project.overrides ??= {};
  if (Object.keys(overrides).length) project.overrides[manifest.name] = overrides;
  else delete project.overrides[manifest.name];
  if (!Object.keys(project.overrides).length) delete project.overrides;
  await Bun.write(consumerFile, `${JSON.stringify(project, null, 2)}\n`);
} else {
  manifest.devDependencies ??= {};
  manifest.devDependencies['@vencord/discord-types'] = 'file:packages/discord-types';
  await Bun.write(file, `${JSON.stringify(manifest, null, 2)}\n`);
}
