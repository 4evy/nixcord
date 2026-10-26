#!/usr/bin/env bun

import { handleCliError, runCli } from './cli.js';

export {
  GeneratePluginOptionsError,
  generatePluginOptions,
  runGeneratePluginOptions,
  validateParsedResults,
} from './runner/index.js';

if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  await runCli().catch(handleCliError);
}
