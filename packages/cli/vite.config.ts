import { createViteConfig } from '../../vite.config.shared.js';

export default createViteConfig({
  mode: 'ssr',
  external: [
    '@nixcord/git-analyzer',
    '@nixcord/nix-generator',
    '@nixcord/parser',
    '@nixcord/shared',
  ],
  banner:
    'import { fileURLToPath as __fileURLToPath } from "node:url"; import { dirname as __pathDirname } from "node:path"; const __filename = __fileURLToPath(import.meta.url); const __dirname = __pathDirname(__filename);',
  testTimeout: 20000,
  testPool: 'threads',
});
