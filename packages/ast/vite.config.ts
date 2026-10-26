import { createViteConfig } from '../../vite.config.shared.js';

export default createViteConfig({
  mode: 'lib',
  entries: { index: 'src/index.ts', runner: 'src/runner.ts' },
  packageDirectory: import.meta.dirname,
});
