import { defineConfig } from 'vitest/config';
import { pluginMetadata } from './docs/site/plugin-metadata/plugin-metadata.js';

export default defineConfig({
  plugins: [pluginMetadata()],
  // Vitest's fork pool uses Node IPC behavior Bun does not implement
  test: { pool: 'threads' },
});
