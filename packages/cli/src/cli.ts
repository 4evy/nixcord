import { CLI_CONFIG, createLogger } from '@nixcord/shared';
import { object } from '@optique/core/constructs';
import { message, text } from '@optique/core/message';
import { optional, withDefault } from '@optique/core/modifiers';
import { argument, flag, option } from '@optique/core/primitives';
import { defineProgram } from '@optique/core/program';
import { run } from '@optique/run';
import { path } from '@optique/run/valueparser';
import { Effect, Result } from 'effect';
import { resolve } from 'pathe';
import type { GeneratePluginOptionsParams } from './runner/index.js';
import { generatePluginOptions } from './runner/index.js';
import { logGeneratePluginOptionsSummary } from './summary.js';

const DEFAULT_OUTPUT = 'modules/plugins-generated.nix';
const DESCRIPTION =
  'Extract Vencord/Equicord plugin settings and generate Nix configuration options';
const CLI_EXIT = Symbol('cli-exit');

const directoryPath = path({ type: 'directory' });
const filePath = path({ type: 'file' });

const buildCli = () =>
  defineProgram({
    parser: object({
      vencord: optional(
        option('--vencord', directoryPath, {
          description: message`Path to Vencord source directory (default: ${CLI_CONFIG.sources.vencord})`,
        })
      ),
      equicord: withDefault(
        option('-e', '--equicord', directoryPath, {
          description: message`Path to Equicord source directory`,
        }),
        CLI_CONFIG.sources.equicord
      ),
      output: withDefault(
        option('-o', '--output', filePath, { description: message`Output file path` }),
        DEFAULT_OUTPUT
      ),
      overrides: optional(
        option('--overrides', filePath, {
          description: message`Path to plugin option overrides JSON`,
        })
      ),
      metadata: optional(
        option('--metadata', filePath, {
          description: message`Write build metadata for the settings converter`,
        })
      ),
      vencordPlugins: withDefault(
        option('--vencord-plugins', '--vencordPlugins', directoryPath, {
          description: message`Relative path to Vencord plugins directory`,
        }),
        CLI_CONFIG.directories.vencordPlugins
      ),
      equicordPlugins: withDefault(
        option('--equicord-plugins', '--equicordPlugins', directoryPath, {
          description: message`Relative path to Equicord plugins directory`,
        }),
        CLI_CONFIG.directories.equicordPlugins
      ),
      skipGitMigrations: withDefault(
        flag('--skip-git-migrations', '--skipGitMigrations', {
          description: message`Do not inspect git history for plugin rename/removal migrations`,
        }),
        false
      ),
      verbose: withDefault(
        flag('-v', '--verbose', { description: message`Enable verbose output` }),
        false
      ),
      vencordArg: optional(
        argument(path({ type: 'directory', metavar: 'VENCORD-PATH' }), {
          description: message`Path to Vencord source directory`,
        })
      ),
    }),
    metadata: {
      name: 'generate-plugin-options',
      version: CLI_CONFIG.version,
      brief: [text(DESCRIPTION)],
    },
  });

export const runCli = async (argv = process.argv): Promise<void> => {
  try {
    const cli = buildCli();
    const flags = run(cli, {
      args: argv.slice(2),
      help: { option: { names: ['-h', '--help'] } },
      version: { value: CLI_CONFIG.version, option: { names: ['-V', '--version'] } },
      completion: 'option',
      showDefault: true,
      termWidth: 'auto',
      stdout: (text) => process.stdout.write(`${text}\n`),
      stderr: (text) => process.stderr.write(`${text}\n`),
      onExit: (code) => {
        // End this invocation without terminating callers that embed the CLI
        process.exitCode = code === 0 ? undefined : code;
        throw CLI_EXIT;
      },
    });

    const logger = createLogger(flags.verbose);
    const params: GeneratePluginOptionsParams = {
      vencordPath: flags.vencord ?? flags.vencordArg ?? CLI_CONFIG.sources.vencord,
      equicordPath: flags.equicord,
      outputPath: resolve(process.cwd(), flags.output),
      ...(flags.metadata ? { metadataPath: resolve(process.cwd(), flags.metadata) } : {}),
      verbose: flags.verbose,
      logger,
      vencordPluginsDir: flags.vencordPlugins,
      equicordPluginsDir: flags.equicordPlugins,
      skipGitMigrations: flags.skipGitMigrations,
      ...(flags.overrides ? { overridesPath: resolve(process.cwd(), flags.overrides) } : {}),
    };

    const outcome = await Effect.runPromise(Effect.result(generatePluginOptions(params)));
    if (Result.isFailure(outcome)) {
      logger.error(`Error: ${outcome.failure.message}`);
      if (flags.verbose && outcome.failure.stack) logger.debug(outcome.failure.stack);
      process.exitCode = 1;
      return;
    }
    logGeneratePluginOptionsSummary(logger, outcome.success);
    process.exitCode = undefined;
  } catch (error) {
    if (error !== CLI_EXIT) handleCliError(error);
  }
};

export const handleCliError = (error: unknown): void => {
  if (error instanceof Error) {
    const logger = createLogger(true);
    logger.error(error.message);
    if (error.stack) {
      logger.debug(error.stack);
    }
    process.exitCode = 1;
    return;
  }
  const logger = createLogger(true);
  logger.error(String(error));
  process.exitCode = 1;
};
