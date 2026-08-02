import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ImportDeclaration, Node, SourceFile, TypeChecker } from 'ts-morph';
import { SyntaxKind, ts } from 'ts-morph';
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

interface ImportBinding {
  readonly localName: string;
  readonly moduleName: string;
  readonly importedName: string;
  readonly declaration: ImportDeclaration;
  readonly reference: Node;
}

const declarationKey = (declaration: Node): string =>
  `${declaration.getSourceFile().getFilePath()}:${declaration.getStart()}`;

const isWithinRoot = (filePath: string, allowedRoot: string): boolean => {
  const pathFromRoot = relative(resolve(allowedRoot), resolve(filePath));
  return (
    pathFromRoot === '' ||
    (pathFromRoot !== '..' && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot))
  );
};

const topLevelDeclaration = (declaration: Node): Node | undefined => {
  const candidate = declaration.isKind(SyntaxKind.VariableDeclaration)
    ? declaration.getVariableStatement()
    : declaration;
  if (candidate?.getParent()?.isKind(SyntaxKind.SourceFile)) return candidate;
  const ancestor = candidate?.getFirstAncestor((node) =>
    Boolean(node.getParent()?.isKind(SyntaxKind.SourceFile))
  );
  return ancestor?.isKind(SyntaxKind.ImportDeclaration) ? undefined : ancestor;
};

const importBinding = (identifier: Node): ImportBinding | undefined => {
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
      declaration: importDeclaration,
      reference: identifier,
    };
  }
  if (declaration.isKind(SyntaxKind.NamespaceImport)) {
    return {
      localName: declaration.getName(),
      moduleName,
      importedName: '*',
      declaration: importDeclaration,
      reference: identifier,
    };
  }
  if (declaration.isKind(SyntaxKind.ImportClause)) {
    const name = declaration.getDefaultImport()?.getText();
    return name
      ? {
          localName: name,
          moduleName,
          importedName: 'default',
          declaration: importDeclaration,
          reference: identifier,
        }
      : undefined;
  }
  return undefined;
};

const bindingTarget = (
  binding: ImportBinding | undefined,
  checker: TypeChecker
): Node | undefined => {
  if (!binding) return undefined;
  let declaration = resolvedDeclaration(binding.reference, checker);
  if (
    declaration?.isKind(SyntaxKind.ImportSpecifier) ||
    declaration?.isKind(SyntaxKind.ImportClause) ||
    declaration?.isKind(SyntaxKind.NamespaceImport) ||
    declaration?.isKind(SyntaxKind.SourceFile)
  )
    declaration = undefined;
  if (declaration || !binding || binding.importedName === '*') return declaration;
  return binding.declaration
    .getModuleSpecifierSourceFile()
    ?.getExportedDeclarations()
    .get(binding.importedName)?.[0];
};

const componentExpressionText = (component: Node): string => {
  const variable = component.asKind(SyntaxKind.VariableDeclaration);
  if (variable) return variable.getInitializerOrThrow().getText();
  const method = component.asKind(SyntaxKind.MethodDeclaration);
  if (method) {
    const parameters = method.getParameters().map((parameter) => parameter.getText());
    return `function (${parameters.join(', ')}) ${method.getBodyOrThrow().getText()}`;
  }
  return component
    .getText()
    .replace(/^\s*export\s+default\s+/, '')
    .replace(/^\s*export\s+/, '');
};

const resolvedComponentTarget = (component: Node, checker: TypeChecker): Node => {
  const declaration = resolvedDeclaration(component, checker);
  if (
    declaration?.isKind(SyntaxKind.VariableDeclaration) ||
    declaration?.isKind(SyntaxKind.FunctionDeclaration) ||
    declaration?.isKind(SyntaxKind.ClassDeclaration) ||
    declaration?.isKind(SyntaxKind.MethodDeclaration)
  )
    return declaration;
  return component;
};

const executableText = (node: Node, defaultName: string): string => {
  const exportAssignment = node.asKind(SyntaxKind.ExportAssignment);
  if (exportAssignment)
    return `const ${defaultName} = (${exportAssignment.getExpression().getText()});`;
  return node
    .getText()
    .replace(/^\s*export\s+default\s+/, '')
    .replace(/^\s*export\s+/, '');
};

const localDeclarationName = (declaration: Node, defaultNames: ReadonlyMap<string, string>) => {
  if (declaration.isKind(SyntaxKind.VariableDeclaration)) {
    const name = declaration.getNameNode();
    return name.isKind(SyntaxKind.Identifier) ? name.getText() : undefined;
  }
  if (
    declaration.isKind(SyntaxKind.FunctionDeclaration) ||
    declaration.isKind(SyntaxKind.ClassDeclaration) ||
    declaration.isKind(SyntaxKind.EnumDeclaration)
  )
    return declaration.getName();
  const topLevel = topLevelDeclaration(declaration);
  return topLevel?.isKind(SyntaxKind.ExportAssignment)
    ? defaultNames.get(declarationKey(topLevel))
    : undefined;
};

const directTopLevelBindingName = (declaration: Node): string | undefined => {
  if (declaration.isKind(SyntaxKind.VariableDeclaration)) {
    if (!declaration.getVariableStatement()?.getParent()?.isKind(SyntaxKind.SourceFile))
      return undefined;
    const name = declaration.getNameNode();
    return name.isKind(SyntaxKind.Identifier) ? name.getText() : undefined;
  }
  if (
    declaration.getParent()?.isKind(SyntaxKind.SourceFile) &&
    (declaration.isKind(SyntaxKind.FunctionDeclaration) ||
      declaration.isKind(SyntaxKind.ClassDeclaration) ||
      declaration.isKind(SyntaxKind.EnumDeclaration))
  )
    return declaration.getName();
  return undefined;
};

const importBindingsFor = (nodes: readonly Node[]): ImportBinding[] => {
  const bindings = new Map<string, ImportBinding>();
  for (const node of nodes) {
    for (const identifier of [
      ...(node.isKind(SyntaxKind.Identifier) ? [node] : []),
      ...node.getDescendantsOfKind(SyntaxKind.Identifier),
    ]) {
      const binding = importBinding(identifier);
      if (binding) bindings.set(binding.localName, binding);
    }
  }
  return [...bindings.values()].sort((left, right) =>
    left.localName.localeCompare(right.localName)
  );
};

const exportedNames = (
  sourceFile: SourceFile,
  selectedDeclarations: ReadonlySet<string>,
  defaultNames: ReadonlyMap<string, string>,
  checker: TypeChecker
): Map<string, string> => {
  const exports = new Map<string, string>();
  for (const [exportName, declarations] of sourceFile.getExportedDeclarations()) {
    for (const original of declarations) {
      const resolved = resolvedDeclaration(original, checker) ?? original;
      const topLevel = topLevelDeclaration(resolved);
      if (!topLevel || !selectedDeclarations.has(declarationKey(topLevel))) continue;
      const localName = localDeclarationName(resolved, defaultNames);
      if (localName) {
        exports.set(exportName, localName);
        break;
      }
    }
  }
  return exports;
};

const uniqueNameFactory = (nodes: readonly Node[]) => {
  const occupied = new Set(
    nodes.flatMap((node) => [
      ...(node.isKind(SyntaxKind.Identifier) ? [node.getText()] : []),
      ...node.getDescendantsOfKind(SyntaxKind.Identifier).map((identifier) => identifier.getText()),
    ])
  );
  return (base: string): string => {
    let candidate = base;
    let suffix = 0;
    while (occupied.has(candidate)) candidate = `${base}${++suffix}`;
    occupied.add(candidate);
    return candidate;
  };
};

function buildSlice(
  root: Node,
  checker: TypeChecker,
  options: Required<
    Pick<SliceExecutionOptions, 'allowedRoot' | 'maxDeclarations' | 'maxSourceBytes'>
  >
): { code: string; evidence: string[] } | SliceExecutionResult {
  const resolvedTarget = resolvedComponentTarget(root, checker);
  const target = isWithinRoot(resolvedTarget.getSourceFile().getFilePath(), options.allowedRoot)
    ? resolvedTarget
    : root;
  const declarations: Node[] = [];
  const declarationKeys = new Set<string>();
  const enclosingBindings = new Set<string>();
  const visiting = new Set<string>();

  const visit = (node: Node): boolean => {
    for (const identifier of [
      ...(node.isKind(SyntaxKind.Identifier) ? [node] : []),
      ...node.getDescendantsOfKind(SyntaxKind.Identifier),
    ]) {
      const binding = importBinding(identifier);
      const declaration =
        bindingTarget(binding, checker) ?? resolvedDeclaration(identifier, checker);
      if (
        !declaration ||
        !isWithinRoot(declaration.getSourceFile().getFilePath(), options.allowedRoot)
      )
        continue;
      const topLevel = topLevelDeclaration(declaration);
      if (!topLevel) continue;
      if (
        topLevel.getSourceFile() === target.getSourceFile() &&
        topLevel.getStart() <= target.getStart() &&
        topLevel.getEnd() >= target.getEnd()
      ) {
        const bindingName =
          declaration === target ? undefined : directTopLevelBindingName(declaration);
        if (bindingName) enclosingBindings.add(bindingName);
        continue;
      }
      const key = declarationKey(topLevel);
      if (declarationKeys.has(key) || visiting.has(key)) continue;
      visiting.add(key);
      if (!visit(topLevel)) return false;
      visiting.delete(key);
      declarationKeys.add(key);
      declarations.push(topLevel);
      if (declarations.length > options.maxDeclarations) return false;
    }
    return true;
  };

  if (!visit(target)) {
    return {
      ok: false,
      code: 'execution-limit',
      message: `dependency slice exceeded ${options.maxDeclarations} declarations`,
      evidence: [],
    };
  }

  const allNodes = [...declarations, target];
  const uniqueName = uniqueNameFactory(allNodes);
  const factoriesName = uniqueName('__nixcordSliceFactories');
  const cacheName = uniqueName('__nixcordSliceCache');
  const requireName = uniqueName('__nixcordSliceRequire');
  const exportsParameter = uniqueName('__nixcordSliceExports');
  const requireParameter = uniqueName('__nixcordSliceImport');
  const targetName = uniqueName('__nixcordSliceTarget');
  const targetExport = uniqueName('__nixcordSliceTargetExport');

  const moduleNodes = new Map<string, Node[]>();
  moduleNodes.set(target.getSourceFile().getFilePath(), []);
  for (const declaration of declarations) {
    const filePath = declaration.getSourceFile().getFilePath();
    const existing = moduleNodes.get(filePath) ?? [];
    existing.push(declaration);
    moduleNodes.set(filePath, existing);
  }
  const modulePaths = [...moduleNodes.keys()].sort((left, right) => left.localeCompare(right));
  const moduleIds = new Map(modulePaths.map((filePath, index) => [filePath, String(index)]));
  const defaultNames = new Map<string, string>();
  for (const declaration of declarations) {
    if (declaration.isKind(SyntaxKind.ExportAssignment))
      defaultNames.set(declarationKey(declaration), uniqueName('__nixcordSliceDefault'));
  }

  const lines = [
    `const ${factoriesName} = Object.create(null);`,
    `const ${cacheName} = Object.create(null);`,
    `const ${requireName} = id => {`,
    `  if (Object.hasOwn(${cacheName}, id)) return ${cacheName}[id];`,
    `  const value = Object.create(null);`,
    `  ${cacheName}[id] = value;`,
    `  ${factoriesName}[id](value, ${requireName});`,
    `  return value;`,
    `};`,
  ];

  for (const filePath of modulePaths) {
    const moduleId = moduleIds.get(filePath) as string;
    const selected = moduleNodes.get(filePath) ?? [];
    const sourceFile = selected[0]?.getSourceFile() ?? target.getSourceFile();
    const nodesForImports =
      sourceFile === target.getSourceFile() ? [...selected, target] : selected;
    const importLines = importBindingsFor(nodesForImports)
      .filter((binding) => binding.localName !== 'React')
      .map((binding) => {
        const declaredTarget = bindingTarget(binding, checker);
        const moduleSource = binding.declaration.getModuleSpecifierSourceFile();
        const targetSource =
          binding.importedName === '*'
            ? moduleSource
            : (declaredTarget?.getSourceFile() ?? moduleSource);
        const targetId = targetSource && moduleIds.get(targetSource.getFilePath());
        if (targetSource && targetId !== undefined) {
          if (binding.importedName === '*')
            return `const ${binding.localName} = ${requireParameter}(${JSON.stringify(targetId)});`;
          const targetExports = exportedNames(targetSource, declarationKeys, defaultNames, checker);
          const targetLocalName = declaredTarget
            ? localDeclarationName(declaredTarget, defaultNames)
            : undefined;
          const exportName =
            [...targetExports.entries()].find(
              ([name, localName]) => name === binding.importedName || localName === targetLocalName
            )?.[0] ?? binding.importedName;
          return `const ${binding.localName} = ${requireParameter}(${JSON.stringify(targetId)})[${JSON.stringify(exportName)}];`;
        }
        return `const ${binding.localName} = __runtime.importValue(${JSON.stringify(binding.moduleName)}, ${JSON.stringify(binding.importedName)}, ${JSON.stringify(binding.localName)});`;
      });
    const declarationLines = selected.map((declaration) =>
      executableText(
        declaration,
        defaultNames.get(declarationKey(declaration)) ?? '__nixcordUnusedDefault'
      )
    );
    const exportLines = [...exportedNames(sourceFile, declarationKeys, defaultNames, checker)].map(
      ([exportName, localName]) =>
        `${exportsParameter}[${JSON.stringify(exportName)}] = ${localName};`
    );
    const isTargetModule = sourceFile === target.getSourceFile();
    const targetLocalName = isTargetModule ? localDeclarationName(target, defaultNames) : undefined;
    const targetTopLevel = isTargetModule ? topLevelDeclaration(target) : undefined;
    const targetExports = targetTopLevel
      ? exportedNames(sourceFile, new Set([declarationKey(targetTopLevel)]), defaultNames, checker)
      : new Map<string, string>();
    const targetLines = isTargetModule
      ? [
          `const ${targetName} = (${componentExpressionText(target)});`,
          ...(targetLocalName && targetLocalName !== targetName
            ? [`const ${targetLocalName} = ${targetName};`]
            : []),
          ...[...targetExports].map(
            ([exportName]) => `${exportsParameter}[${JSON.stringify(exportName)}] = ${targetName};`
          ),
          `${exportsParameter}[${JSON.stringify(targetExport)}] = ${targetName};`,
        ]
      : [];
    const enclosingBindingLines = isTargetModule
      ? [...enclosingBindings]
          .sort((left, right) => left.localeCompare(right))
          .map(
            (bindingName) =>
              `const ${bindingName} = __runtime.importValue("", "", ${JSON.stringify(bindingName)});`
          )
      : [];
    const targetInitializer = target.isKind(SyntaxKind.VariableDeclaration)
      ? target.getInitializer()
      : target;
    const targetCanBeInitializedBeforeImports = Boolean(
      targetInitializer?.isKind(SyntaxKind.ArrowFunction) ||
        targetInitializer?.isKind(SyntaxKind.FunctionExpression) ||
        target.isKind(SyntaxKind.FunctionDeclaration) ||
        target.isKind(SyntaxKind.MethodDeclaration)
    );
    lines.push(
      `${factoriesName}[${JSON.stringify(moduleId)}] = (${exportsParameter}, ${requireParameter}) => {`,
      ...[
        ...(targetCanBeInitializedBeforeImports ? targetLines : []),
        ...importLines,
        ...(!targetCanBeInitializedBeforeImports ? targetLines : []),
        ...enclosingBindingLines,
        ...declarationLines,
        ...exportLines,
      ].map((line) => `  ${line}`),
      `};`
    );
  }

  const rootModuleId = moduleIds.get(target.getSourceFile().getFilePath()) as string;
  lines.push(
    `return __runtime.run(${requireName}(${JSON.stringify(rootModuleId)})[${JSON.stringify(targetExport)}]);`
  );
  const code = lines.join('\n');
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
  return built.replace(/\/dist\/execution-runner\.js$/, '/src/execution-runner.ts');
};

const nodeExecutable = (): string => {
  if (!('bun' in process.versions)) return process.execPath;
  for (const directory of (process.env.PATH ?? '').split(':')) {
    const candidate = `${directory}/node`;
    if (existsSync(candidate)) return candidate;
  }
  return 'node';
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
    code: transpileSlice(slice.code),
    settingKey: options.settingKey,
    maxTraceEvents,
  });

  return await new Promise<SliceExecutionResult>((resolveResult) => {
    const child = spawn(
      nodeExecutable(),
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
    const finish = (result: SliceExecutionResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
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
