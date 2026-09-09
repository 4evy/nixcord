import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, test } from 'vitest';
import {
  extractPluginDeletions,
  extractPluginMigrations,
  extractPluginRenames,
} from '../src/index.js';

const exec = promisify(execFile);
const roots: string[] = [];
const dirs = ['src/plugins', 'src/equicordplugins'];

async function repository() {
  const root = await mkdtemp(join(tmpdir(), 'nixcord-history-'));
  roots.push(root);
  const git = async (...args: string[]) =>
    (
      await exec('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
        cwd: root,
        env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
      })
    ).stdout.trim();
  await git('init', '--initial-branch=main');
  await git('config', 'user.name', 'Nixcord test');
  await git('config', 'user.email', 'test@example.invalid');
  const write = async (path: string, text: string) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  };
  const commit = async (daysAgo = 0) => {
    await git('add', '.');
    const date = new Date(Date.now() - daysAgo * 86400000).toISOString();
    await exec(
      'git',
      [
        '-c',
        'core.hooksPath=/dev/null',
        '-c',
        'commit.gpgSign=false',
        'commit',
        '-m',
        'test: fixture history',
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_AUTHOR_DATE: date,
          GIT_COMMITTER_DATE: date,
        },
      }
    );
    return git('rev-parse', 'HEAD');
  };
  return { root, git, write, commit };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Git history integration', () => {
  test('distinguishes renames, deletions, and removed settings in nested files', async () => {
    const repo = await repository();
    await repo.write(
      'src/plugins/old/index.ts',
      'export default { name: "Old", description: "rename fixture" };\n'
    );
    await repo.write(
      'src/equicordplugins/deleted/index.tsx',
      'export default { name: "Deleted" };\n'
    );
    await repo.write(
      'src/plugins/settings/nested/settings.ts',
      `const settings = definePluginSettings({
  retained: { type: 1 },
  removed: { type: 2, nested: { value: true } },
});\n`
    );
    await repo.commit();
    await rename(join(repo.root, 'src/plugins/old'), join(repo.root, 'src/plugins/new'));
    await rm(join(repo.root, 'src/equicordplugins/deleted'), { recursive: true });
    await repo.write(
      'src/plugins/settings/nested/settings.ts',
      `const settings = definePluginSettings({
  retained: { type: 1 },
});\n`
    );
    const hash = await repo.commit();
    const result = await extractPluginMigrations(repo.root, dirs);
    expect(result.renames).toEqual([
      { oldName: 'old', newName: 'new', commitHash: hash, commitDate: expect.any(String) },
    ]);
    expect(result.deletions).toEqual([
      { pluginName: 'deleted', commitHash: hash, commitDate: expect.any(String) },
    ]);
    expect(result.settingRemovals).toEqual([
      {
        plugin: 'settings',
        setting: 'removed',
        removed: true,
        commitHash: hash,
        commitDate: expect.any(String),
      },
    ]);
  });

  test('excludes expired migrations and honors the requested history window', async () => {
    const repo = await repository();
    await repo.write('src/plugins/old/index.ts', 'export default { name: "Old" };\n');
    await repo.write('src/plugins/deleted/index.ts', 'export default { name: "Deleted" };\n');
    await repo.commit(1000);
    await rename(join(repo.root, 'src/plugins/old'), join(repo.root, 'src/plugins/new'));
    await rm(join(repo.root, 'src/plugins/deleted'), { recursive: true });
    await repo.commit(900);
    expect(await extractPluginMigrations(repo.root, dirs)).toEqual({
      renames: [],
      deletions: [],
      settingRemovals: [],
    });
    expect(await extractPluginRenames(repo.root, dirs, 1001)).toHaveLength(1);
    expect(await extractPluginDeletions(repo.root, dirs, 1001)).toHaveLength(1);
  });

  test('does not read a parent repository or require Git metadata for source archives', async () => {
    const repo = await repository();
    await repo.write('src/plugins/old/index.ts', 'export default {};\n');
    await repo.commit();
    await rename(join(repo.root, 'src/plugins/old'), join(repo.root, 'src/plugins/new'));
    await repo.commit();
    await mkdir(join(repo.root, 'archive/src/plugins'), { recursive: true });
    for (const root of [join(repo.root, 'archive'), join(repo.root, 'missing')]) {
      expect(await extractPluginMigrations(root, dirs)).toEqual({
        renames: [],
        deletions: [],
        settingRemovals: [],
      });
    }
    expect(await extractPluginRenames(repo.root, dirs)).toHaveLength(1);
  });
});
