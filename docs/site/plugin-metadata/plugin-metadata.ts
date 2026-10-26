import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import type { Plugin } from 'vite';

const moduleId = 'virtual:nixcord-plugin-metadata';
const resolvedId = `\0${moduleId}`;
const root = resolve(import.meta.dirname, '../../..');
const exec = promisify(execFile);

export function pluginMetadata(): Plugin {
  let metadata: Promise<string> | undefined;
  return {
    name: 'nixcord-plugin-metadata',
    resolveId(id) {
      return id === moduleId ? resolvedId : undefined;
    },
    load(id) {
      if (id !== resolvedId) return;
      metadata ??= generateMetadata();
      return metadata.then((json) => `export default ${json};`);
    },
  };
}

async function generateMetadata(): Promise<string> {
  const directory = await mkdtemp(resolve(tmpdir(), 'nixcord-docs-'));
  const env = { ...process.env };
  delete env.NODE_ENV;
  delete env.VITEST;
  try {
    await exec(
      'bun',
      [
        resolve(root, 'packages/cli/dist/index.js'),
        '--vencord',
        resolve(root, 'node_modules/vencord'),
        '--equicord',
        resolve(root, 'node_modules/equicord'),
        '--equicord-plugins',
        'src/equicordplugins',
        '--output',
        resolve(directory, 'options.nix'),
        '--metadata',
        resolve(directory, 'metadata.json'),
        '--overrides',
        resolve(root, 'modules/plugins/overrides.json'),
        '--skip-git-migrations',
      ],
      { cwd: root, env }
    );
    return await readFile(resolve(directory, 'metadata.json'), 'utf8');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
