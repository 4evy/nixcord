import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Node, TypeChecker } from 'ts-morph';
import { ts } from 'ts-morph';
import { buildSlice } from './execution/build.js';

export interface SliceExecutionOptions {
  readonly settingKey: string;
  readonly allowedRoot: string;
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
  readonly maxTraceEvents?: number;
  readonly maxDeclarations?: number;
  readonly maxSourceBytes?: number;
}

export interface SliceTraceEvent {
  readonly kind: 'read' | 'write' | 'control';
  readonly path?: readonly string[];
  readonly component?: string;
  readonly value?: unknown;
}

export type SliceExecutionResult =
  | {
      readonly ok: true;
      readonly events: readonly SliceTraceEvent[];
      readonly hasDefault: boolean;
      readonly value?: unknown;
      readonly evidence: readonly string[];
    }
  | {
      readonly ok: false;
      readonly code: 'execution-timeout' | 'execution-failed' | 'execution-limit';
      readonly message: string;
      readonly evidence: readonly string[];
    };

const runnerPath = (): string => {
  const directory = dirname(fileURLToPath(import.meta.url));
  const candidates = ['runner.js', 'runner.ts', '../src/runner.ts'].map((path) =>
    resolve(directory, path)
  );
  return candidates.find(existsSync) ?? candidates[0];
};

const transpileSlice = (code: string): string => {
  const source = `const __nixcordExecuteSlice = async (__runtime: unknown, React: unknown) => {\n${code}\n};`;
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
      jsx: ts.JsxEmit.React,
    },
  }).outputText;
  return `${output}\nreturn __nixcordExecuteSlice(__runtime, React);`;
};

export async function executeComponentSlice(
  component: Node,
  checker: TypeChecker,
  options: SliceExecutionOptions
): Promise<SliceExecutionResult> {
  const timeoutMs = options.timeoutMs ?? 3_000;
  const maxOutputBytes = options.maxOutputBytes ?? 256 * 1024;
  const maxTraceEvents = options.maxTraceEvents ?? 256;
  const slice = buildSlice(component, checker, {
    allowedRoot: options.allowedRoot,
    maxDeclarations: options.maxDeclarations ?? 256,
    maxSourceBytes: options.maxSourceBytes ?? 512 * 1024,
  });
  if ('ok' in slice) return slice;

  const payload = JSON.stringify({
    code: transpileSlice(slice.code),
    settingKey: options.settingKey,
    maxTraceEvents,
  });
  const readyMarker = Buffer.from('__NIXCORD_SLICE_READY__\n');
  const startupTimeoutMs = 30_000;

  return await new Promise<SliceExecutionResult>((resolveResult) => {
    const child = spawn(
      process.execPath,
      ['--permission', '--max-old-space-size=64', runnerPath()],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {},
        cwd: options.allowedRoot,
      }
    );
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    let settled = false;
    let ready = false;
    let readyBuffer = Buffer.alloc(0);
    let executionTimer: ReturnType<typeof setTimeout> | undefined;
    let startupTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (result: SliceExecutionResult) => {
      if (settled) return;
      settled = true;
      if (executionTimer) clearTimeout(executionTimer);
      if (startupTimer) clearTimeout(startupTimer);
      resolveResult(result);
    };
    const collect = (target: Buffer[], chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > maxOutputBytes) {
        child.kill('SIGKILL');
        finish({
          ok: false,
          code: 'execution-limit',
          message: `slice output exceeded ${maxOutputBytes} bytes`,
          evidence: slice.evidence,
        });
        return;
      }
      target.push(chunk);
    };
    const startExecution = () => {
      ready = true;
      if (startupTimer) clearTimeout(startupTimer);
      executionTimer = setTimeout(() => {
        child.kill('SIGKILL');
        finish({
          ok: false,
          code: 'execution-timeout',
          message: `slice exceeded ${timeoutMs}ms`,
          evidence: slice.evidence,
        });
      }, timeoutMs);
      child.stdin.end(payload);
    };
    child.stdout.on('data', (chunk: Buffer) => {
      if (ready) {
        collect(stdout, chunk);
        return;
      }
      readyBuffer = Buffer.concat([readyBuffer, chunk]);
      if (readyBuffer.byteLength > maxOutputBytes) {
        child.kill('SIGKILL');
        finish({
          ok: false,
          code: 'execution-limit',
          message: `slice output exceeded ${maxOutputBytes} bytes`,
          evidence: slice.evidence,
        });
        return;
      }
      const markerIndex = readyBuffer.indexOf(readyMarker);
      if (markerIndex < 0) return;
      const responseStart = markerIndex + readyMarker.byteLength;
      const response = readyBuffer.subarray(responseStart);
      readyBuffer = Buffer.alloc(0);
      if (response.byteLength > 0) collect(stdout, response);
      startExecution();
    });
    child.stderr.on('data', (chunk: Buffer) => collect(stderr, chunk));
    child.on('error', (error) =>
      finish({
        ok: false,
        code: 'execution-failed',
        message: error.message,
        evidence: slice.evidence,
      })
    );
    child.on('close', (code) => {
      if (settled) return;
      if (code !== 0) {
        finish({
          ok: false,
          code: 'execution-failed',
          message: Buffer.concat(stderr).toString('utf8').trim() || `runner exited with ${code}`,
          evidence: slice.evidence,
        });
        return;
      }
      try {
        const result = JSON.parse(Buffer.concat(stdout).toString('utf8')) as SliceExecutionResult;
        finish(
          result.ok ? { ...result, evidence: [...slice.evidence, ...result.evidence] } : result
        );
      } catch (error) {
        finish({
          ok: false,
          code: 'execution-failed',
          message: `invalid runner response: ${error instanceof Error ? error.message : String(error)}`,
          evidence: slice.evidence,
        });
      }
    });
    // Exclude Node and runner startup from the execution budget so cold or slow
    // builders still get the full time allowed for evaluating the slice.
    startupTimer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({
        ok: false,
        code: 'execution-timeout',
        message: `slice runner failed to start within ${startupTimeoutMs}ms`,
        evidence: slice.evidence,
      });
    }, startupTimeoutMs);
  });
}
