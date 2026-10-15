import { createViteConfig } from '../../vite.config.shared.js';

export default createViteConfig({
  mode: 'lib',
  packageDirectory: import.meta.dirname,
  entries: { index: 'src/index.ts', runner: 'src/runner.ts' },
});
