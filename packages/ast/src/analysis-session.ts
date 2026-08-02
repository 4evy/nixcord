import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { type Program, Project, type SourceFile, type TypeChecker, ts } from 'ts-morph';

export interface AnalysisSessionOptions {
  readonly rootPath: string;
  readonly filePaths: readonly string[];
  readonly tsConfigPath?: string;
}

export interface AnalysisSession {
  readonly rootPath: string;
  readonly project: Project;
  readonly program: Program;
  readonly checker: TypeChecker;
  readonly sourceFiles: readonly SourceFile[];
  getSourceFile(filePath: string): SourceFile | undefined;
}

const exists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

/**
 * Creates a fully-loaded, immutable analysis view. Callers provide the complete file set up front;
 * adding or removing files after this function returns is deliberately not part of the API.
 */
export async function createAnalysisSession(
  options: AnalysisSessionOptions
): Promise<AnalysisSession> {
  const rootPath = resolve(options.rootPath);
  const tsConfigPath = options.tsConfigPath ? resolve(options.tsConfigPath) : undefined;
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: false,
    skipLoadingLibFiles: true,
    tsConfigFilePath: tsConfigPath && (await exists(tsConfigPath)) ? tsConfigPath : undefined,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.React,
      allowJs: true,
      skipLibCheck: true,
    },
  });

  const filePaths = [...new Set(options.filePaths.map((path) => resolve(path)))].sort((a, b) =>
    a.localeCompare(b)
  );
  project.addSourceFilesAtPaths(filePaths);
  project.resolveSourceFileDependencies();

  const sourceFiles = project
    .getSourceFiles()
    .filter((sourceFile) => !sourceFile.isDeclarationFile())
    .sort((a, b) => a.getFilePath().localeCompare(b.getFilePath()));
  const program = project.getProgram();
  const checker = project.getTypeChecker();

  return Object.freeze({
    rootPath,
    project,
    program,
    checker,
    sourceFiles: Object.freeze(sourceFiles),
    getSourceFile: (filePath: string) => project.getSourceFile(resolve(filePath)),
  });
}
