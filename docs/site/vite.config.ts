import { execFileSync } from 'node:child_process';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { pluginMetadata } from './plugin-metadata/plugin-metadata.js';

function resolveRevision() {
  if (process.env.NIXCORD_REVISION) return process.env.NIXCORD_REVISION;

  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/nixcord/' : '/',
  define: {
    __NIXCORD_REVISION__: JSON.stringify(resolveRevision()),
  },
  plugins: [pluginMetadata(), svelte(), tailwindcss()],
}));
