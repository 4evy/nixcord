import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { isBuiltin } from 'node:module';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../../..');
let temporary: string;
let entrypoint: string;
const env = { ...process.env };
delete env.NODE_ENV;
delete env.VITEST;

beforeAll(async () => {
  temporary = await mkdtemp(join(root, 'node_modules/.nixcord-cli-test-'));
  await build({
    configFile: join(root, 'packages/cli/vite.config.ts'),
    logLevel: 'silent',
    resolve: {
      alias: Object.fromEntries(
        ['cli', 'parser', 'ast', 'git-analyzer', 'nix-generator', 'shared'].map((name) => [
          `@nixcord/${name}`,
          join(root, 'packages', name, 'src/index.ts'),
        ])
      ),
    },
    build: {
      ssr: join(root, 'packages/cli/src/index.ts'),
      outDir: temporary,
      emptyOutDir: false,
      rolldownOptions: {
        external: isBuiltin,
        output: { entryFileNames: 'cli.mjs' },
      },
    },
  });
  entrypoint = join(temporary, 'cli.mjs');
});

afterAll(async () => {
  if (temporary) await rm(temporary, { recursive: true, force: true });
});

describe('executable CLI', () => {
  test('prints help and rejects invalid source paths with a nonzero exit', async () => {
    const help = await exec(process.execPath, [entrypoint, '--help'], { env });
    expect(help.stdout).toContain('generate-plugin-options');
    expect(help.stdout).toContain('--vencord');
    await expect(
      exec(process.execPath, [entrypoint, '--vencord', join(temporary, 'missing')], { env })
    ).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('does not exist') });
  });

  test('generates plugin metadata from real fixtures through the executable', async () => {
    const output = join(temporary, 'generated/options.nix');
    for (const client of ['vencord', 'equicord']) {
      await cp(join(root, 'packages/parser/tests/fixtures', client), join(temporary, client), {
        recursive: true,
      });
      await writeFile(join(temporary, client, 'package.json'), JSON.stringify({ name: client }));
    }
    await exec(
      process.execPath,
      [
        entrypoint,
        '--vencord',
        join(temporary, 'vencord'),
        '--equicord',
        join(temporary, 'equicord'),
        '--output',
        output,
        '--skip-git-migrations',
      ],
      { env }
    );
    const shared = JSON.parse(
      await readFile(join(temporary, 'generated/plugins/shared.json'), 'utf8')
    );
    expect(shared.sharedPlugin).toBeDefined();
    expect(shared.sharedPlugin.settings).toBeDefined();
  });
});
