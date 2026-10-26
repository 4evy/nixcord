import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Node as NativeNode, SyntaxKind } from '@typescript/native/ast';
import { API, type Symbol as NativeSymbol, type Project } from '@typescript/native/async';
import { createFileSystemLayer } from '@typescript/native/fs';
import { Effect } from 'effect';
import { AstView, Symbol as BoundSymbol, type Node, type SourceFile, TypeChecker } from './ast.js';

export interface AnalysisSessionOptions {
  readonly rootPath: string;
  readonly filePaths: readonly string[];
  readonly tsConfigPath?: string;
  readonly resolveBindings?: boolean;
  readonly sources?: Readonly<Record<string, string>>;
}

export interface AnalysisSession extends AsyncDisposable {
  readonly rootPath: string;
  readonly project: Project;
  readonly checker: TypeChecker;
  readonly sourceFiles: readonly SourceFile[];
  getSourceFile(filePath: string): SourceFile | undefined;
  dispose(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
}

const forEachConcurrent = <T>(
  items: readonly T[],
  action: (item: T, index: number) => Promise<void>
): Promise<void> =>
  Effect.runPromise(
    Effect.forEach(
      items,
      (item, index) =>
        Effect.tryPromise({ try: () => action(item, index), catch: (cause) => cause }),
      { concurrency: 16, discard: true }
    )
  );

// Batch binding queries once per file; recursive evaluation then reads immutable
// local facts rather than making an IPC request for every identifier visit
const prepareBindings = async (
  project: Project,
  view: AstView,
  files: Map<string, SourceFile>
): Promise<void> => {
  // Cache interned symbol objects because native symbol IDs are file-scoped
  const symbols = new WeakMap<NativeSymbol, Promise<BoundSymbol>>();
  const seen = new Set<string>();
  const pending: SourceFile[] = [...files.values()];
  const remember = (native: NativeNode): Node => {
    const source = native.getSourceFile();
    const file = view.wrap(source)!;
    if (!files.has(source.fileName)) {
      files.set(source.fileName, file);
      if (!source.isDeclarationFile) pending.push(file);
    }
    return view.wrap(native)!;
  };
  const bind = (native: NativeSymbol): Promise<BoundSymbol> => {
    let promise = symbols.get(native);
    if (promise) return promise;
    const symbol = new BoundSymbol(native);
    promise = (async () => {
      const declarations = await Promise.all(native.declarations.map((handle) => handle.resolve()));
      symbol.declarations = declarations.filter((node) => node !== undefined).map(remember);
      const value = await native.valueDeclaration?.resolve();
      if (value) symbol.valueDeclaration = remember(value);
      if (symbol.isAlias()) {
        const alias = await project.checker.getAliasedSymbol(native);
        if (alias !== native) symbol.alias = await bind(alias);
      }
      return symbol;
    })();
    symbols.set(native, promise);
    return promise;
  };
  while (pending.length > 0) {
    const file = pending.shift()!;
    if (seen.has(file.getFilePath())) continue;
    seen.add(file.getFilePath());
    if (await project.program.isSourceFileDefaultLibrary(file.native))
      view.defaultLibraries.add(file.getFilePath());
    const nodes = [file, ...file.getDescendants()];
    const references = nodes.filter((node) =>
      [SyntaxKind.Identifier, SyntaxKind.PropertyAccessExpression].includes(node.getKind())
    );
    for (let offset = 0; offset < references.length; offset += 512) {
      const batch = references.slice(offset, offset + 512);
      const found = await project.checker.getSymbolAtLocation(batch.map((n) => n.native));
      await forEachConcurrent(batch, async (node, index) => {
        const symbol = found[index];
        if (symbol) view.symbols.set(node.native, await bind(symbol));
      });
    }
    await forEachConcurrent(
      nodes.filter((n) => n.isKind(SyntaxKind.ShorthandPropertyAssignment)),
      async (node) => {
        const symbol = await project.checker.getShorthandAssignmentValueSymbol(node.native);
        if (symbol) view.shorthands.set(node.native, await bind(symbol));
      }
    );
    await forEachConcurrent(
      nodes.filter((n) => n.isKind(SyntaxKind.EnumMember)),
      async (node) => {
        const value = await project.checker.getConstantValue(node.native);
        if (value !== undefined) view.constants.set(node.native, value);
      }
    );
    const imports = file.getImportDeclarations();
    for (let offset = 0; offset < imports.length; offset += 512) {
      const batch = imports.slice(offset, offset + 512);
      const modules = await project.checker.getSymbolAtLocation(
        batch.map((node) => node.native.moduleSpecifier)
      );
      await forEachConcurrent(batch, async (node, index) => {
        const module = modules[index];
        if (!module) return;
        const bound = await bind(module);
        const source = bound.declarations.find((n) => n.isKind(SyntaxKind.SourceFile));
        if (source) view.modules.set(node.native, source);
      });
    }
    const module = await project.checker.getSymbolAtLocation(file.native);
    if (module) {
      const exports = await project.checker.getExportsOfModule(module);
      const entries = new Map<string, Node[]>();
      await forEachConcurrent(exports, async (native) => {
        const symbol = await bind(native);
        entries.set(native.name, (symbol.alias ?? symbol).declarations);
      });
      view.exports.set(file.native, entries);
    }
  }
};

export async function createAnalysisSession(
  options: AnalysisSessionOptions
): Promise<AnalysisSession> {
  const rootPath = resolve(options.rootPath);
  const filePaths = [...new Set(options.filePaths.map((path) => resolve(path)))].sort();
  const config = resolve(rootPath, '.nixcord-analysis.json');
  const tsConfig = options.tsConfigPath && resolve(options.tsConfigPath);
  const sources = Object.fromEntries(
    Object.entries(options.sources ?? {}).map(([path, text]) => [resolve(path), text])
  );
  // TypeScript 7.1 layers virtual sources over the host filesystem per snapshot
  const virtual = createFileSystemLayer(
    Object.entries({
      ...sources,
      [config]: JSON.stringify({
        ...(tsConfig && existsSync(tsConfig) ? { extends: tsConfig } : {}),
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          jsx: 'react',
          allowJs: true,
          skipLibCheck: true,
          noEmit: true,
        },
        files: filePaths,
        include: [],
      }),
    })
  );
  const api = new API({ cwd: rootPath });
  await using resources = new AsyncDisposableStack();
  resources.defer(() => api.close());
  const snapshot = resources.adopt(
    await api.createSnapshot({ openProjects: [config], fileSystem: virtual }),
    (snapshot) => snapshot.dispose()
  );
  const project = snapshot.getConfiguredProject(config);
  if (!project) throw new Error(`Native TypeScript did not open ${config}`);
  const view = new AstView();
  view.printNode = (node) => api.printer.printNode(node);
  const files = new Map<string, SourceFile>();
  await forEachConcurrent(filePaths, async (path) => {
    const file = await project.program.getSourceFile(path);
    if (file) files.set(file.fileName, view.wrap(file)!);
  });
  if (options.resolveBindings !== false) await prepareBindings(project, view, files);
  await forEachConcurrent([...files.values()], async (file) => {
    if (await project.program.isSourceFileDefaultLibrary(file.native))
      view.defaultLibraries.add(file.getFilePath());
  });
  const ownedResources = resources.move();
  const dispose = () => ownedResources.disposeAsync();
  return Object.freeze({
    rootPath,
    project,
    checker: new TypeChecker(project.checker, view),
    sourceFiles: Object.freeze(
      [...files.values()]
        .filter((file) => !file.isDeclarationFile())
        .sort((a, b) => a.getFilePath().localeCompare(b.getFilePath()))
    ),
    getSourceFile: (path: string) => files.get(resolve(path)),
    dispose,
    [Symbol.asyncDispose]: dispose,
  });
}
