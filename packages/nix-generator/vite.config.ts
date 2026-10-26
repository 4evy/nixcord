import { createViteConfig } from '../../vite.config.shared.js';

export default createViteConfig({
  mode: 'lib',
  packageDirectory: import.meta.dirname,
  entries: { index: 'src/index.ts', identifier: 'src/identifier.ts' },
  testTimeout: 20_000,
  testPool: 'threads',
});
