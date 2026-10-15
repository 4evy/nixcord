import { chmod, copyFile, mkdir, rm, unlink } from 'node:fs/promises';
import { spawn } from 'bun';

await mkdir('public', { recursive: true });

const build = spawn(['nix', 'build', '../..#docs-json', '--out-link', '.options-json-result'], {
  stdout: 'inherit',
  stderr: 'inherit',
});
const status = await build.exited;
if (status !== 0) process.exit(status);

const destination = 'public/options.json';
await rm(destination, { force: true });
await copyFile('.options-json-result/share/doc/nixos/options.json', destination);
await chmod(destination, 0o644);
await unlink('.options-json-result');
