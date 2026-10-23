import { Data, Effect } from 'effect';

export class PluginParseError extends Data.TaggedError('PluginParseError')<{
  readonly stage: 'options' | 'discovery' | 'session' | 'analysis';
  readonly sourcePath: string;
  readonly message: string;
  readonly cause: unknown;
}> {}

const failure = (stage: PluginParseError['stage'], sourcePath: string, cause: unknown) =>
  new PluginParseError({
    stage,
    sourcePath,
    cause,
    message: cause instanceof Error ? cause.message : String(cause),
  });

export const parseOperation = <A>(
  stage: PluginParseError['stage'],
  sourcePath: string,
  operation: (signal: AbortSignal) => Promise<A>
): Effect.Effect<A, PluginParseError> =>
  Effect.tryPromise({
    try: operation,
    catch: (cause) => failure(stage, sourcePath, cause),
  });
