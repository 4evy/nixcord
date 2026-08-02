import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Node, TypeChecker } from 'ts-morph';
import { SyntaxKind } from 'ts-morph';
import { resolvedDeclaration } from './node-helpers.js';

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
  readonly kind: 'read' | 'write' | 'control' | 'render';
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

interface ExternalBinding {
  readonly localName: string;
  readonly moduleName: string;
  readonly importedName: string;
}

const topLevelDeclaration = (declaration: Node): Node | undefined => {
  if (declaration.isKind(SyntaxKind.VariableDeclaration)) return declaration.getVariableStatement();
  if (
    declaration.isKind(SyntaxKind.FunctionDeclaration) ||
    declaration.isKind(SyntaxKind.ClassDeclaration) ||
    declaration.isKind(SyntaxKind.EnumDeclaration)
  )
    return declaration;
  return declaration.getFirstAncestor((ancestor) =>
    Boolean(ancestor.getParent()?.isKind(SyntaxKind.SourceFile))
  );
};

const importBinding = (identifier: Node): ExternalBinding | undefined => {
  let declaration: Node | undefined;
  try {
    declaration = identifier.getSymbol()?.getDeclarations()[0];
  } catch {
    return undefined;
  }
  const importDeclaration = declaration?.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);
  if (!declaration || !importDeclaration) return undefined;
  const moduleName = importDeclaration.getModuleSpecifierValue();
  if (declaration.isKind(SyntaxKind.ImportSpecifier)) {
    return {
      localName: declaration.getAliasNode()?.getText() ?? declaration.getName(),
      moduleName,
      importedName: declaration.getName(),
    };
  }
  if (declaration.isKind(SyntaxKind.NamespaceImport)) {
    return { localName: declaration.getName(), moduleName, importedName: '*' };
  }
  if (declaration.isKind(SyntaxKind.ImportClause)) {
    const name = declaration.getDefaultImport()?.getText();
    return name ? { localName: name, moduleName, importedName: 'default' } : undefined;
  }
  return undefined;
};

const executableText = (node: Node): string =>
  node
    .getText()
    .replace(/^\s*export\s+default\s+/, '')
    .replace(/^\s*export\s+/, '');

function buildSlice(
  root: Node,
  checker: TypeChecker,
  options: Required<
    Pick<SliceExecutionOptions, 'allowedRoot' | 'maxDeclarations' | 'maxSourceBytes'>
  >
): { code: string; evidence: string[] } | SliceExecutionResult {
  const declarations: Node[] = [];
  const declarationKeys = new Set<string>();
  const external = new Map<string, ExternalBinding>();
  const visiting = new Set<string>();

  const visit = (node: Node): boolean => {
    for (const identifier of [
      ...(node.isKind(SyntaxKind.Identifier) ? [node] : []),
      ...node.getDescendantsOfKind(SyntaxKind.Identifier),
    ]) {
      const binding = importBinding(identifier);
      const declaration = resolvedDeclaration(identifier, checker);
      if (
        declaration &&
        declaration.getSourceFile().getFilePath().startsWith(options.allowedRoot)
      ) {
        const topLevel = topLevelDeclaration(declaration);
        if (!topLevel || topLevel === node) continue;
        const key = `${topLevel.getSourceFile().getFilePath()}:${topLevel.getStart()}`;
        if (declarationKeys.has(key) || visiting.has(key)) continue;
        visiting.add(key);
        if (!visit(topLevel)) return false;
        visiting.delete(key);
        declarationKeys.add(key);
        declarations.push(topLevel);
        if (declarations.length > options.maxDeclarations) return false;
      } else if (binding) {
        external.set(binding.localName, binding);
      }
    }
    return true;
  };

  if (!visit(root)) {
    return {
      ok: false,
      code: 'execution-limit',
      message: `dependency slice exceeded ${options.maxDeclarations} declarations`,
      evidence: [],
    };
  }
  const stubs = [...external.values()]
    .sort((a, b) => a.localName.localeCompare(b.localName))
    .filter(({ localName }) => localName !== 'React')
    .map(
      ({ localName, moduleName, importedName }) =>
        `const ${localName} = __runtime.importValue(${JSON.stringify(moduleName)}, ${JSON.stringify(importedName)}, ${JSON.stringify(localName)});`
    );
  const code = [
    ...stubs,
    ...declarations.map(executableText),
    `const __sliceTarget = (${root.getText()});`,
    `return __runtime.run(__sliceTarget);`,
  ].join('\n\n');
  if (Buffer.byteLength(code) > options.maxSourceBytes) {
    return {
      ok: false,
      code: 'execution-limit',
      message: `dependency slice exceeded ${options.maxSourceBytes} source bytes`,
      evidence: [],
    };
  }
  return {
    code,
    evidence: declarations.map(
      (declaration) =>
        `${declaration.getSourceFile().getFilePath()}:${declaration.getStartLineNumber()}`
    ),
  };
}

const runnerPath = (): string => {
  const built = resolve(dirname(fileURLToPath(import.meta.url)), 'execution-runner.js');
  if (existsSync(built)) return built;
  if (built.includes('/src/')) return built.replace(/execution-runner\.js$/, 'execution-runner.ts');
  const source = built.replace(/\/dist\/execution-runner\.js$/, '/src/execution-runner.ts');
  return source;
};

const bunExecutable = (): string => {
  if ('bun' in process.versions) return process.execPath;
  for (const directory of (process.env.PATH ?? '').split(':')) {
    const candidate = `${directory}/bun`;
    if (existsSync(candidate)) return candidate;
  }
  return 'bun';
};

export async function executeComponentSlice(
  component: Node,
  checker: TypeChecker,
  options: SliceExecutionOptions
): Promise<SliceExecutionResult> {
  const timeoutMs = options.timeoutMs ?? 1_000;
  const maxOutputBytes = options.maxOutputBytes ?? 256 * 1024;
  const maxTraceEvents = options.maxTraceEvents ?? 256;
  const slice = buildSlice(component, checker, {
    allowedRoot: options.allowedRoot,
    maxDeclarations: options.maxDeclarations ?? 256,
    maxSourceBytes: options.maxSourceBytes ?? 512 * 1024,
  });
  if ('ok' in slice) return slice;

  const payload = JSON.stringify({
    code: slice.code,
    settingKey: options.settingKey,
    maxTraceEvents,
  });

  return await new Promise<SliceExecutionResult>((resolve) => {
    const child = spawn(bunExecutable(), [runnerPath()], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {},
      cwd: options.allowedRoot,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    let settled = false;
    const finish = (result: SliceExecutionResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
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
    child.stdout.on('data', (chunk: Buffer) => collect(stdout, chunk));
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
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({
        ok: false,
        code: 'execution-timeout',
        message: `slice exceeded ${timeoutMs}ms`,
        evidence: slice.evidence,
      });
    }, timeoutMs);
    child.stdin.end(payload);
  });
}
