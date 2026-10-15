import { Effect } from 'effect';
import ora from 'ora';

export const withSpinner = <A, E, R>(
  operation: Effect.Effect<A, E, R>,
  options: {
    readonly text: string;
    readonly successText: (result: A) => string;
    readonly failText: (error: E) => string;
  }
): Effect.Effect<A, E, R> =>
  Effect.acquireUseRelease(
    Effect.sync(() => ora(options.text).start()),
    (spinner) =>
      operation.pipe(
        Effect.tap((result) => Effect.sync(() => spinner.succeed(options.successText(result)))),
        Effect.tapError((error) => Effect.sync(() => spinner.fail(options.failText(error))))
      ),
    (spinner) => Effect.sync(() => spinner.stop())
  );
