import { createViteConfig } from '../../vite.config.shared.js';

export default createViteConfig({
  mode: 'lib',
  packageDirectory: import.meta.dirname,
  testTimeout: 20_000,
  testPool: 'threads',
});
