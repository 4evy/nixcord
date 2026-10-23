import { defineConfig } from 'vitest/config';
import { pluginMetadata } from './docs/site/plugin-metadata/plugin-metadata.js';

export default defineConfig({ plugins: [pluginMetadata()] });
