import type { Logger, ParsedPluginsResult } from '@nixcord/domain';
import { ParsedPluginsResultSchema, parseOrThrow } from '@nixcord/domain';
import { type ParsePluginsOptions, parsePluginsEffect } from '@nixcord/parser';
import { Effect } from 'effect';
import fse from 'fs-extra';
import { GeneratePluginOptionsError } from './errors.js';
import { withSpinner } from './spinner.js';

type SourceLabel = 'Vencord' | 'Equicord';

export const ensurePathExists = async (path: string, message: string): Promise<void> => {
  const exists = await fse.pathExists(path);
  if (!exists) {
    throw new GeneratePluginOptionsError({ stage: 'sources', message, cause: undefined });
  }
};

export const validateParsedResults = (
  vencordResult: ParsedPluginsResult,
  equicordResult?: ParsedPluginsResult
): void => {
  parseOrThrow(ParsedPluginsResultSchema, vencordResult, Error);
  if (equicordResult) {
    parseOrThrow(ParsedPluginsResultSchema, equicordResult, Error);
  }
};

export const parseSource = ({
  label,
  path,
  verbose,
  logger,
  parseOptions,
}: {
  label: SourceLabel;
  path: string;
  verbose: boolean;
  logger: Logger;
  parseOptions: ParsePluginsOptions;
}): Effect.Effect<ParsedPluginsResult, GeneratePluginOptionsError> => {
  const operation = parsePluginsEffect(path, parseOptions).pipe(
    Effect.mapError(
      (cause) => new GeneratePluginOptionsError({ stage: 'sources', message: cause.message, cause })
    )
  );
  if (verbose) {
    return Effect.sync(() => logger.info(`Parsing ${label} plugins from: ${path}`)).pipe(
      Effect.andThen(operation)
    );
  }

  return withSpinner(operation, {
    text: `Parsing ${label} plugins...`,
    successText: (result) => {
      const total =
        Object.keys(result.vencordPlugins).length + Object.keys(result.equicordPlugins).length;
      return `Parsed ${total} plugins from ${label}`;
    },
    failText: (error) => `Failed to parse ${label} plugins: ${error.message}`,
  });
};
