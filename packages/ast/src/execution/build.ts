import { type Node, SyntaxKind, type TypeChecker } from 'ts-morph';
import type { SliceExecutionOptions, SliceExecutionResult } from '../execute.js';
import { resolvedDeclaration } from '../nodes.js';
import {
  bindingTarget,
  declarationKey,
  directTopLevelBindingName,
  exportedNames,
  importBindingsFor,
  isWithinRoot,
  localDeclarationName,
  resolvedComponentTarget,
  topLevelDeclaration,
} from './bindings.js';
import { componentExpressionText, executableText, uniqueNameFactory } from './source.js';

// Build source-isolated module factories before the runner receives any code
export function buildSlice(
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
  const enclosingVariable = target.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  if (enclosingVariable?.getVariableStatement()?.getParent()?.isKind(SyntaxKind.SourceFile)) {
    const name = enclosingVariable.getNameNode();
    if (name.isKind(SyntaxKind.Identifier)) enclosingBindings.add(name.getText());
  }

  const visit = (node: Node): boolean => {
    for (const identifier of [
      ...(node.isKind(SyntaxKind.Identifier) ? [node] : []),
      ...node.getDescendantsOfKind(SyntaxKind.Identifier),
    ]) {
      const declaration = resolvedDeclaration(identifier, checker);
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
    const importLines = importBindingsFor(nodesForImports, checker)
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
    const enclosingBindingExportLines = isTargetModule
      ? [...enclosingBindings]
          .sort((left, right) => left.localeCompare(right))
          .map(
            (bindingName) => `${exportsParameter}[${JSON.stringify(bindingName)}] = ${bindingName};`
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
        ...enclosingBindingLines,
        ...enclosingBindingExportLines,
        ...importLines,
        ...(!targetCanBeInitializedBeforeImports ? targetLines : []),
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
