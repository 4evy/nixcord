import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Node, TypeChecker } from '@nixcord/typescript-analysis';
import { Deferred, Effect } from 'effect';
import { buildSlice } from './execution/build.js';
import {
  decodeSliceExecutionResult,
  type RunnerPayload,
  type SliceExecutionOptions,
  type SliceExecutionResult,
} from './types/types.js';

const runnerPath = (): string => {
  const directory = dirname(fileURLToPath(import.meta.url));
  const candidates = ['runner.js', 'runner.ts', '../src/runner.ts'].map((path) =>
    resolve(directory, path)
  );
  return candidates.find(existsSync) ?? candidates[0];
};

const transpileSlice = (code: string): string => {
  const source = `const __executeSlice = async (__runtime: unknown, React: unknown) => {\n${code}\n};`;
  const output = new Bun.Transpiler({
    loader: 'tsx',
    tsconfig: {
      compilerOptions: {
        jsx: 'react',
        jsxFactory: 'React.createElement',
        jsxFragmentFactory: 'React.Fragment',
      },
    },
  }).transformSync(source);
  return `${output}\nreturn __executeSlice(__runtime, React);`;
};

export function executeComponentSliceEffect(
  component: Node,
  checker: TypeChecker,
  options: SliceExecutionOptions
): Effect.Effect<SliceExecutionResult> {
  return Effect.gen(function* () {
    const timeoutMs = options.timeoutMs ?? 3_000;
    const maxOutputBytes = options.maxOutputBytes ?? 256 * 1024;
    const maxTraceEvents = options.maxTraceEvents ?? 256;
    const slice = yield* Effect.promise(() =>
      buildSlice(component, checker, {
        allowedRoot: options.allowedRoot,
        maxDeclarations: options.maxDeclarations ?? 256,
        maxSourceBytes: options.maxSourceBytes ?? 512 * 1024,
      })
    );
    if ('ok' in slice) return slice;

    const payload = JSON.stringify({
      code: transpileSlice(slice.code),
      settingKey: options.settingKey,
      maxTraceEvents,
    } satisfies RunnerPayload);
    const readyMarker = Buffer.from('__SLICE_READY__\n');
    const startupTimeoutMs = 30_000;

    return yield* Effect.scoped(
      Effect.gen(function* () {
        const ready = yield* Deferred.make<SliceExecutionResult | undefined>();
        const completed = yield* Deferred.make<SliceExecutionResult>();
        const failure = (
          code: Extract<SliceExecutionResult, { ok: false }>['code'],
          message: string
        ): SliceExecutionResult => ({ ok: false, code, message, evidence: slice.evidence });
        const child = yield* Effect.acquireRelease(
          Effect.sync(() =>
            spawn(process.execPath, ['--smol', runnerPath()], {
              stdio: ['pipe', 'pipe', 'pipe'],
              env: {},
              cwd: options.allowedRoot,
            })
          ),
          (child) =>
            Effect.sync(() => {
              child.kill('SIGKILL');
            })
        );
        const stdout: Buffer[] = [];
        const stderr: Buffer[] = [];
        let outputBytes = 0;
        let readyBuffer = Buffer.alloc(0);
        let receivedReady = false;
        const finish = (result: SliceExecutionResult) => {
          Deferred.doneUnsafe(completed, Effect.succeed(result));
          // An early exit also releases the startup wait
          Deferred.doneUnsafe(ready, Effect.succeed(result));
        };
        const collect = (target: Buffer[], chunk: Buffer) => {
          if (Deferred.isDoneUnsafe(completed)) return;
          outputBytes += chunk.byteLength;
          if (outputBytes > maxOutputBytes) {
            finish(failure('execution-limit', `slice output exceeded ${maxOutputBytes} bytes`));
            return;
          }
          target.push(chunk);
        };
        child.stdout.on('data', (chunk: Buffer) => {
          if (receivedReady) {
            collect(stdout, chunk);
            return;
          }
          readyBuffer = Buffer.concat([readyBuffer, chunk]);
          if (readyBuffer.byteLength > maxOutputBytes) {
            finish(failure('execution-limit', `slice output exceeded ${maxOutputBytes} bytes`));
            return;
          }
          const markerIndex = readyBuffer.indexOf(readyMarker);
          if (markerIndex < 0) return;
          receivedReady = true;
          const response = readyBuffer.subarray(markerIndex + readyMarker.byteLength);
          readyBuffer = Buffer.alloc(0);
          if (response.byteLength > 0) collect(stdout, response);
          Deferred.doneUnsafe(ready, Effect.succeed(undefined));
        });
        child.stderr.on('data', (chunk: Buffer) => collect(stderr, chunk));
        child.on('error', (error) => finish(failure('execution-failed', error.message)));
        child.stdin.on('error', (error) => finish(failure('execution-failed', error.message)));
        child.on('close', (code) => {
          if (Deferred.isDoneUnsafe(completed)) return;
          if (code !== 0) {
            finish(
              failure(
                'execution-failed',
                Buffer.concat(stderr).toString('utf8').trim() || `runner exited with ${code}`
              )
            );
            return;
          }
          try {
            const result = decodeSliceExecutionResult(Buffer.concat(stdout).toString('utf8'));
            finish(
              result.ok ? { ...result, evidence: [...slice.evidence, ...result.evidence] } : result
            );
          } catch (error) {
            finish(
              failure(
                'execution-failed',
                `invalid runner response: ${error instanceof Error ? error.message : String(error)}`
              )
            );
          }
        });

        // Give cold builders their startup budget before timing slice execution
        const startupResult = yield* Deferred.await(ready).pipe(
          Effect.timeoutOrElse({
            duration: startupTimeoutMs,
            orElse: () =>
              Effect.succeed(
                failure(
                  'execution-timeout',
                  `slice runner failed to start within ${startupTimeoutMs}ms`
                )
              ),
          })
        );
        if (startupResult !== undefined) return startupResult;
        child.stdin.end(payload);
        return yield* Deferred.await(completed).pipe(
          Effect.timeoutOrElse({
            duration: timeoutMs,
            orElse: () =>
              Effect.succeed(failure('execution-timeout', `slice exceeded ${timeoutMs}ms`)),
          })
        );
      })
    );
  });
}

export function executeComponentSlice(
  component: Node,
  checker: TypeChecker,
  options: SliceExecutionOptions
): Promise<SliceExecutionResult> {
  return Effect.runPromise(executeComponentSliceEffect(component, checker, options));
}
