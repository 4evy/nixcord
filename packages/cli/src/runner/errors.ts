import { Data, Effect } from 'effect';

export class GeneratePluginOptionsError extends Data.TaggedError('GeneratePluginOptionsError')<{
  readonly stage: 'validation' | 'sources' | 'generation' | 'migrations' | 'overrides';
  readonly message: string;
  readonly cause: unknown;
}> {}

export const generationStep = <A>(
  stage: GeneratePluginOptionsError['stage'],
  operation: () => Promise<A>
): Effect.Effect<A, GeneratePluginOptionsError> =>
  Effect.tryPromise({
    try: operation,
    catch: (cause) =>
      new GeneratePluginOptionsError({
        stage,
        cause,
        message: cause instanceof Error ? cause.message : String(cause),
      }),
  });

export const generationValue = <A>(
  stage: GeneratePluginOptionsError['stage'],
  operation: () => A
): Effect.Effect<A, GeneratePluginOptionsError> =>
  Effect.try({
    try: operation,
    catch: (cause) =>
      new GeneratePluginOptionsError({
        stage,
        cause,
        message: cause instanceof Error ? cause.message : String(cause),
      }),
  });
