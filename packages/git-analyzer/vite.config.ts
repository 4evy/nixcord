import { createViteConfig } from '../../vite.config.shared.js';

export default createViteConfig({
  mode: 'lib',
  external: [/^node:/, '@nixcord/shared', 'p-limit', 'ts-morph'],
});
