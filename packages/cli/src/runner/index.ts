import { generatePluginSchema } from '@nixcord/nix-generator';
import { categorizePlugins, type ParsePluginsOptions } from '@nixcord/parser';
import { CLI_CONFIG } from '@nixcord/shared';
import { Effect, Schema } from 'effect';
import { resolve } from 'pathe';
import { applyPluginOverrides } from '../overrides.js';
import { summarizeDiagnostics } from './diagnostics.js';
import { GeneratePluginOptionsError, generationStep, generationValue } from './errors.js';
import { writeMigrations } from './migrations.js';
import { writeOutputs } from './outputs.js';
import {
  type GeneratePluginOptionsParams,
  GeneratePluginOptionsParamsSchema,
  type GeneratePluginOptionsSummary,
} from './params.js';
import { ensurePathExists, parseSource, validateParsedResults } from './sources.js';

export { GeneratePluginOptionsError } from './errors.js';
export type {
  GeneratePluginOptionsParams,
  GeneratePluginOptionsSummary,
} from './params.js';
export { validateParsedResults } from './sources.js';

export const generatePluginOptions = (
  rawParams: GeneratePluginOptionsParams
): Effect.Effect<GeneratePluginOptionsSummary, GeneratePluginOptionsError> =>
  Effect.gen(function* () {
    const parsedParams = yield* Schema.decodeUnknownEffect(GeneratePluginOptionsParamsSchema)(
      rawParams
    ).pipe(
      Effect.mapError(
        (cause) =>
          new GeneratePluginOptionsError({ stage: 'validation', message: cause.message, cause })
      )
    );
    const verbose = parsedParams.verbose ?? false;
    const resolvedVencordPath = resolve(process.cwd(), parsedParams.vencordPath);
    const vencordPackageJsonPath = resolve(resolvedVencordPath, CLI_CONFIG.filenames.packageJson);
    yield* generationStep('sources', () =>
      ensurePathExists(
        vencordPackageJsonPath,
        `Vencord source path does not exist or is not a directory: ${resolvedVencordPath}`
      )
    );

    const vencordPluginsPath = resolve(resolvedVencordPath, parsedParams.vencordPluginsDir);
    yield* generationStep('sources', () =>
      ensurePathExists(
        vencordPluginsPath,
        `Vencord plugins directory not found: ${vencordPluginsPath}`
      )
    );

    const resolvedEquicordPath = yield* Effect.gen(function* () {
      if (typeof parsedParams.equicordPath !== 'string') return undefined;
      const resolved = resolve(process.cwd(), parsedParams.equicordPath);
      const equicordPackageJsonPath = resolve(resolved, CLI_CONFIG.filenames.packageJson);
      yield* generationStep('sources', () =>
        ensurePathExists(
          equicordPackageJsonPath,
          `Equicord source path does not exist or is not a directory: ${resolved}`
        )
      );

      const equicordPluginsPath = resolve(resolved, parsedParams.equicordPluginsDir);
      yield* generationStep('sources', () =>
        ensurePathExists(
          equicordPluginsPath,
          `Equicord plugins directory not found: ${equicordPluginsPath}`
        )
      );
      return resolved;
    });

    const parseOptions: ParsePluginsOptions = {
      vencordPluginsDir: parsedParams.vencordPluginsDir,
      equicordPluginsDir: parsedParams.equicordPluginsDir,
    };

    const vencordResult = yield* parseSource({
      label: 'Vencord',
      path: resolvedVencordPath,
      verbose,
      logger: parsedParams.logger,
      parseOptions,
    });

    const equicordResult = resolvedEquicordPath
      ? yield* parseSource({
          label: 'Equicord',
          path: resolvedEquicordPath,
          verbose,
          logger: parsedParams.logger,
          parseOptions,
        })
      : undefined;

    yield* generationValue('validation', () =>
      validateParsedResults(vencordResult, equicordResult)
    );

    const diagnostics = [
      ...(vencordResult.diagnostics ?? []),
      ...(equicordResult?.diagnostics ?? []),
    ];
    const diagnosticSummary = summarizeDiagnostics(diagnostics);
    if (verbose && diagnostics.length > 0) {
      parsedParams.logger.warn(`Parser reported ${diagnostics.length} diagnostics`);
      for (const diagnostic of diagnostics.slice(0, 20)) {
        parsedParams.logger.warn(
          `${diagnostic.code}${diagnostic.pluginName ? ` (${diagnostic.pluginName})` : ''}: ${diagnostic.message}`
        );
      }
    }

    const categorized = yield* generationValue('generation', () =>
      categorizePlugins(vencordResult, equicordResult)
    );

    if (verbose) {
      parsedParams.logger.info(
        `Found ${Object.keys(vencordResult.vencordPlugins).length} plugins in Vencord src/plugins`
      );
      if (equicordResult) {
        parsedParams.logger.info(
          `Found ${Object.keys(equicordResult.vencordPlugins).length} plugins in Equicord src/plugins`
        );
        parsedParams.logger.info(
          `Found ${Object.keys(equicordResult.equicordPlugins).length} plugins in Equicord src/equicordplugins`
        );
      }
      parsedParams.logger.info(
        `Categorized: ${Object.keys(categorized.generic).length} generic (shared), ${Object.keys(categorized.vencordOnly).length} Vencord-only, ${
          Object.keys(categorized.equicordOnly).length
        } Equicord-only`
      );
    }

    const generatedSchemas = yield* generationValue('generation', () => ({
      shared: generatePluginSchema(categorized.generic, 'shared'),
      vencord: generatePluginSchema(categorized.vencordOnly, 'vencord'),
      equicord: generatePluginSchema(categorized.equicordOnly, 'equicord'),
    }));
    const overridesPath = parsedParams.overridesPath;
    const schemas = overridesPath
      ? yield* generationStep('overrides', () =>
          applyPluginOverrides(overridesPath, generatedSchemas)
        )
      : generatedSchemas;

    const outputSummary = yield* generationStep('generation', () =>
      writeOutputs({
        generic: categorized.generic,
        vencordOnly: categorized.vencordOnly,
        equicordOnly: categorized.equicordOnly,
        outputPath: parsedParams.outputPath,
        schemas,
        metadataPath: parsedParams.metadataPath,
      })
    );
    const summary = diagnosticSummary ? { ...outputSummary, diagnosticSummary } : outputSummary;

    yield* writeMigrations(
      parsedParams,
      resolvedVencordPath,
      resolvedEquicordPath,
      vencordResult,
      equicordResult,
      categorized
    ).pipe(
      Effect.catchTag('GeneratePluginOptionsError', (error) =>
        Effect.sync(() => {
          if (verbose) parsedParams.logger.warn(`Failed to extract migrations: ${error.message}`);
        })
      )
    );

    return summary;
  });

export const runGeneratePluginOptions = (
  params: GeneratePluginOptionsParams
): Promise<GeneratePluginOptionsSummary> => Effect.runPromise(generatePluginOptions(params));
