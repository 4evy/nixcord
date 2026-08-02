import {
  type AnalysisSession,
  createAnalysisSession,
  executeComponentSlice,
  resolvedDeclaration,
  StaticEvaluator,
  type StaticValue,
  traceComponentSetting,
  traceStoreSetting,
} from '@nixcord/ast';
import {
  CLI_CONFIG,
  type ParseDiagnostic,
  type ParsedPluginsResult,
  type PluginConfig,
  type PluginRename,
  type PluginSetting,
  type ReadonlyDeep,
  type SettingRename,
  type SettingScalar,
  type SettingType,
  type SettingValue,
} from '@nixcord/shared';
import fg from 'fast-glob';
import fse from 'fs-extra';
import pLimit from 'p-limit';
import { basename, dirname, join, normalize, relative, resolve } from 'pathe';
import {
  type CallExpression,
  type Node,
  type ObjectLiteralExpression,
  type SourceFile,
  SyntaxKind,
  type TypeChecker,
  type TypeLiteralNode,
} from 'ts-morph';
import * as z from 'zod';
import { applySettingRule, inferTypeFromValue, type SelectOption } from './setting-rules.js';
import {
  type OptionTypeName,
  SOURCE_PROFILES,
  type SourceKind,
  type SourceProfile,
} from './source-profiles.js';

const PROGRESS_REPORT_INTERVAL = 25;
const PLUGIN_DIR_SEPARATOR_PATTERN = /[-_]/;
const EXECUTION_CONCURRENCY = 4;

const ParsePluginsOptionsSchema = z.object({
  vencordPluginsDir: z.string().min(1).optional(),
  equicordPluginsDir: z.string().min(1).optional(),
  executionMode: z.enum(['disabled', 'fallback']).optional(),
});

export interface ParsePluginsOptions {
  readonly vencordPluginsDir?: string;
  readonly equicordPluginsDir?: string;
  readonly executionMode?: 'disabled' | 'fallback';
}

interface DirectoryParseResult {
  readonly plugins: ReadonlyDeep<Record<string, PluginConfig>>;
  readonly settingRenames: SettingRename[];
  readonly pluginRenames: PluginRename[];
  readonly diagnostics: ParseDiagnostic[];
}

interface PluginContext {
  readonly pluginDir: string;
  readonly pluginPath: string;
  readonly sourceFiles: readonly SourceFile[];
  readonly profile: SourceProfile;
  readonly session: AnalysisSession;
  readonly evaluator: StaticEvaluator;
  readonly executionMode: 'disabled' | 'fallback';
  readonly executionLimit: ReturnType<typeof pLimit>;
  readonly diagnostics: ParseDiagnostic[];
}

interface PluginParseResult {
  readonly entry?: readonly [string, PluginConfig];
  readonly settingRenames: SettingRename[];
  readonly pluginRenames: PluginRename[];
  readonly diagnostics: ParseDiagnostic[];
}

type RawRecord = Record<string, unknown>;

const emptyDirectoryResult = (): DirectoryParseResult => ({
  plugins: {} as ReadonlyDeep<Record<string, PluginConfig>>,
  settingRenames: [],
  pluginRenames: [],
  diagnostics: [],
});

const inferPluginName = (pluginDir: string, pluginInfoName: string | undefined): string =>
  pluginInfoName ||
  pluginDir
    .split(PLUGIN_DIR_SEPARATOR_PATTERN)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

const locationFor = (node: Node): NonNullable<ParseDiagnostic['location']> => {
  const position = node.getSourceFile().getLineAndColumnAtPos(node.getStart());
  return {
    file: node.getSourceFile().getFilePath(),
    line: position.line,
    column: position.column,
  };
};

const diagnostic = (
  code: string,
  severity: ParseDiagnostic['severity'],
  stage: ParseDiagnostic['stage'],
  message: string,
  options: {
    pluginName?: string;
    settingPath?: string;
    node?: Node;
    evidence?: readonly string[];
  } = {}
): ParseDiagnostic => ({
  code,
  severity,
  stage,
  message,
  ...(options.pluginName ? { pluginName: options.pluginName } : {}),
  ...(options.settingPath ? { settingPath: options.settingPath } : {}),
  ...(options.node ? { location: locationFor(options.node) } : {}),
  ...(options.evidence?.length ? { evidence: options.evidence } : {}),
});

const importIdentity = (
  expression: Node
): { readonly moduleName: string; readonly importedName: string } | undefined => {
  try {
    const symbol = expression.getSymbol();
    let declaration = symbol?.getDeclarations()[0];
    if (!declaration && expression.isKind(SyntaxKind.Identifier)) {
      const localName = expression.getText();
      for (const importDeclaration of expression.getSourceFile().getImportDeclarations()) {
        const defaultImport = importDeclaration.getDefaultImport();
        if (defaultImport?.getText() === localName)
          declaration = importDeclaration.getImportClause();
        const namespaceImport = importDeclaration.getNamespaceImport();
        if (namespaceImport?.getText() === localName)
          declaration = namespaceImport.getParentIfKind(SyntaxKind.NamespaceImport);
        for (const namedImport of importDeclaration.getNamedImports()) {
          const importedLocalName = namedImport.getAliasNode()?.getText() ?? namedImport.getName();
          if (importedLocalName === localName) declaration = namedImport;
        }
        if (declaration) break;
      }
    }
    const importDeclaration = declaration?.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);
    if (!declaration || !importDeclaration) return undefined;
    const moduleName = importDeclaration.getModuleSpecifierValue();
    if (declaration.isKind(SyntaxKind.ImportSpecifier)) {
      return { moduleName, importedName: declaration.getName() };
    }
    if (declaration.isKind(SyntaxKind.ImportClause)) {
      return { moduleName, importedName: 'default' };
    }
    if (declaration.isKind(SyntaxKind.NamespaceImport)) {
      return { moduleName, importedName: '*' };
    }
  } catch {
    return undefined;
  }
  return undefined;
};

const callName = (call: CallExpression): string | undefined => {
  const expression = call.getExpression();
  if (expression.isKind(SyntaxKind.Identifier)) return expression.getText();
  if (expression.isKind(SyntaxKind.PropertyAccessExpression)) return expression.getName();
  return undefined;
};

const isApiCall = (
  call: CallExpression,
  canonicalName: string,
  profile: SourceProfile,
  checker: TypeChecker
): boolean => {
  try {
    const expression = call.getExpression();
    const identity = importIdentity(
      expression.isKind(SyntaxKind.PropertyAccessExpression)
        ? expression.getExpression()
        : expression
    );
    const allowedModules = profile.apiDeclarations[canonicalName] ?? profile.apiModules;
    if (identity && allowedModules.includes(identity.moduleName)) {
      return (
        identity.importedName === canonicalName ||
        (identity.importedName === 'default' && canonicalName === 'definePlugin') ||
        (identity.importedName === '*' && callName(call) === canonicalName)
      );
    }

    const symbol = checker.getSymbolAtLocation(expression) ?? expression.getSymbol();
    const resolved = symbol?.isAlias() ? symbol.getAliasedSymbol() : symbol;
    const declaration = resolved?.getValueDeclaration() ?? resolved?.getDeclarations()[0];
    const declarationName =
      declaration && 'getName' in declaration
        ? (declaration as { getName(): string | undefined }).getName()
        : undefined;
    const filePath = declaration?.getSourceFile().getFilePath().replaceAll('\\', '/');
    return Boolean(
      declarationName === canonicalName &&
        (filePath?.endsWith('/src/api/Settings.ts') || filePath?.endsWith('/src/utils/types.ts'))
    );
  } catch {
    return false;
  }
};

const apiCalls = (
  sourceFiles: readonly SourceFile[],
  name: string,
  profile: SourceProfile,
  checker: TypeChecker
): CallExpression[] =>
  sourceFiles
    .flatMap((sourceFile) => sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression))
    .filter((call) => isApiCall(call, name, profile, checker));

const declarationInitializer = (node: Node, checker: TypeChecker): Node | undefined => {
  try {
    const declaration = resolvedDeclaration(node, checker);
    if (declaration && 'getInitializer' in declaration)
      return (declaration as { getInitializer(): Node | undefined }).getInitializer();
  } catch {
    return undefined;
  }
  return undefined;
};

const unwrapNode = (node: Node): Node => {
  const expression =
    node.asKind(SyntaxKind.AsExpression)?.getExpression() ??
    node.asKind(SyntaxKind.TypeAssertionExpression)?.getExpression() ??
    node.asKind(SyntaxKind.ParenthesizedExpression)?.getExpression() ??
    node.asKind(SyntaxKind.NonNullExpression)?.getExpression() ??
    node.asKind(SyntaxKind.SatisfiesExpression)?.getExpression();
  return expression ? unwrapNode(expression) : node;
};

const resolveNode = (node: Node | undefined, checker: TypeChecker): Node | undefined => {
  if (!node) return undefined;
  const unwrapped = unwrapNode(node);
  if (unwrapped.isKind(SyntaxKind.Identifier)) {
    const initializer = declarationInitializer(unwrapped, checker);
    return initializer && initializer !== node ? resolveNode(initializer, checker) : unwrapped;
  }
  return unwrapped;
};

const explicitTypeText = (
  node: Node | undefined,
  checker: TypeChecker,
  visited = new Set<string>()
): string | undefined => {
  if (!node) return undefined;
  const key = `${node.getSourceFile().getFilePath()}:${node.getStart()}:${node.getEnd()}`;
  if (visited.has(key)) return undefined;
  visited.add(key);

  const assertedType =
    node.asKind(SyntaxKind.AsExpression)?.getTypeNode() ??
    node.asKind(SyntaxKind.TypeAssertionExpression)?.getTypeNode() ??
    node.asKind(SyntaxKind.SatisfiesExpression)?.getTypeNode();
  if (assertedType) return assertedType.getText();

  if (node.isKind(SyntaxKind.Identifier)) {
    try {
      const declaration = resolvedDeclaration(node, checker);
      if (declaration?.isKind(SyntaxKind.VariableDeclaration)) {
        const declaredType = declaration.getTypeNode()?.getText();
        if (declaredType) return declaredType;
        const fromInitializer = explicitTypeText(declaration.getInitializer(), checker, visited);
        if (fromInitializer) return fromInitializer;
      }
    } catch {}
  }

  const unwrapped = unwrapNode(node);
  if (unwrapped.isKind(SyntaxKind.ConditionalExpression)) {
    const branchTypes = [unwrapped.getWhenTrue(), unwrapped.getWhenFalse()]
      .map((branch) => explicitTypeText(branch, checker, new Set(visited)))
      .filter((type): type is string => type !== undefined);
    if (branchTypes.length === 2 && branchTypes[0] === branchTypes[1]) return branchTypes[0];
  }
  if (unwrapped.isKind(SyntaxKind.ArrayLiteralExpression)) {
    const elements = unwrapped.getElements();
    if (elements.length === 0) return undefined;
    if (elements.every((element) => unwrapNode(element).isKind(SyntaxKind.StringLiteral)))
      return 'string[]';
    if (elements.every((element) => unwrapNode(element).isKind(SyntaxKind.NumericLiteral)))
      return 'number[]';
    if (
      elements.every((element) => {
        const candidate = unwrapNode(element);
        return (
          candidate.isKind(SyntaxKind.TrueKeyword) || candidate.isKind(SyntaxKind.FalseKeyword)
        );
      })
    )
      return 'boolean[]';
    if (elements.every((element) => unwrapNode(element).isKind(SyntaxKind.ObjectLiteralExpression)))
      return 'Record<string, unknown>[]';
  }

  try {
    const type = checker.getTypeAtLocation(node).getText();
    return type && type !== '{}' ? type : undefined;
  } catch {
    return undefined;
  }
};

const objectPropertyInitializer = (
  object: ObjectLiteralExpression | undefined,
  name: string
): Node | undefined =>
  object?.getProperty(name)?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();

const objectArgument = (call: CallExpression | undefined): ObjectLiteralExpression | undefined =>
  call?.getArguments()[0]?.asKind(SyntaxKind.ObjectLiteralExpression);

const findDefinePluginCall = (
  entry: SourceFile,
  profile: SourceProfile,
  checker: TypeChecker
): CallExpression | undefined =>
  entry
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((call) => isApiCall(call, 'definePlugin', profile, checker));

const findSettingsCallFromNode = (
  node: Node | undefined,
  profile: SourceProfile,
  checker: TypeChecker,
  visited = new Set<string>()
): CallExpression | undefined => {
  const resolved = resolveNode(node, checker);
  if (!resolved) return undefined;
  const key = `${resolved.getSourceFile().getFilePath()}:${resolved.getStart()}`;
  if (visited.has(key)) return undefined;
  visited.add(key);
  const call = resolved.asKind(SyntaxKind.CallExpression);
  if (call) {
    if (isApiCall(call, 'definePluginSettings', profile, checker)) return call;
    const property = call.getExpression().asKind(SyntaxKind.PropertyAccessExpression);
    if (property?.getName() === 'withPrivateSettings')
      return findSettingsCallFromNode(property.getExpression(), profile, checker, visited);
  }
  return undefined;
};

const findSettingsCall = (
  definePluginCall: CallExpression | undefined,
  sourceFiles: readonly SourceFile[],
  profile: SourceProfile,
  checker: TypeChecker
): CallExpression | undefined => {
  const pluginObject = objectArgument(definePluginCall);
  const referenced = findSettingsCallFromNode(
    objectPropertyInitializer(pluginObject, 'settings'),
    profile,
    checker
  );
  return referenced ?? apiCalls(sourceFiles, 'definePluginSettings', profile, checker)[0];
};

const settingsBindingsForCall = (call: CallExpression): readonly Node[] => {
  const binding = call.getAncestors().find((ancestor) => {
    if (ancestor.isKind(SyntaxKind.VariableDeclaration))
      return ancestor.getInitializer()?.containsRange(call.getStart(), call.getEnd()) ?? false;
    if (ancestor.isKind(SyntaxKind.PropertyAssignment))
      return ancestor.getInitializer()?.containsRange(call.getStart(), call.getEnd()) ?? false;
    return ancestor.isKind(SyntaxKind.ExportAssignment);
  });
  return binding ? [binding] : [];
};

const evaluated = (node: Node | undefined, evaluator: StaticEvaluator): unknown => {
  if (!node) return undefined;
  const result = evaluator.evaluate(node);
  return result.known ? result.value : undefined;
};

const isRecord = (value: unknown): value is RawRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !('callable' in value);

const jsonValue = (
  value: unknown
): { readonly valid: true; readonly value: SettingValue } | { readonly valid: false } => {
  if (typeof value === 'number' && !Number.isFinite(value)) return { valid: false };
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value))
    return { valid: true, value: value as SettingValue };
  if (Array.isArray(value)) {
    const items: SettingValue[] = [];
    for (const item of value) {
      const converted = jsonValue(item);
      if (!converted.valid) return { valid: false };
      items.push(converted.value);
    }
    return { valid: true, value: items };
  }
  if (isRecord(value)) {
    const output: Record<string, SettingValue> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) continue;
      const converted = jsonValue(item);
      if (!converted.valid) return { valid: false };
      output[key] = converted.value;
    }
    return { valid: true, value: output };
  }
  return { valid: false };
};

const rawOptions = (value: unknown): SelectOption[] =>
  Array.isArray(value)
    ? value.flatMap((option) => {
        if (!isRecord(option)) return [];
        const scalar = option.value;
        if (!['string', 'number', 'boolean'].includes(typeof scalar)) return [];
        return [
          {
            value: scalar as SettingScalar,
            ...(typeof option.label === 'string' ? { label: option.label } : {}),
            isDefault: option.default === true,
          },
        ];
      })
    : [];

const scalarFromNode = (
  node: Node | undefined,
  evaluator: StaticEvaluator,
  profile: SourceProfile,
  bindings: ReadonlyMap<string, StaticValue> = new Map()
): SettingScalar | undefined => {
  if (!node) return undefined;
  const result = evaluator.evaluate(node, bindings);
  if (
    result.known &&
    (typeof result.value === 'string' ||
      typeof result.value === 'number' ||
      typeof result.value === 'boolean')
  )
    return result.value;
  const property = unwrapNode(node).asKind(SyntaxKind.PropertyAccessExpression);
  if (!property) return undefined;
  const enumName = property.getExpression().getText().split('.').at(-1);
  return enumName ? profile.enumMemberFallbacks[enumName]?.[property.getName()] : undefined;
};

const optionsFromNode = (node: Node | undefined, context: PluginContext): SelectOption[] => {
  const resolved = resolveNode(node, context.session.checker);
  const optionFromObject = (
    object: ObjectLiteralExpression,
    bindings: ReadonlyMap<string, StaticValue> = new Map()
  ): SelectOption | undefined => {
    const value = scalarFromNode(
      objectPropertyInitializer(object, 'value'),
      context.evaluator,
      context.profile,
      bindings
    );
    if (value === undefined) return undefined;
    const label = scalarFromNode(
      objectPropertyInitializer(object, 'label'),
      context.evaluator,
      context.profile,
      bindings
    );
    const selected = scalarFromNode(
      objectPropertyInitializer(object, 'default'),
      context.evaluator,
      context.profile,
      bindings
    );
    return {
      value,
      ...(typeof label === 'string' ? { label } : {}),
      isDefault: selected === true,
    };
  };
  const call = resolved?.asKind(SyntaxKind.CallExpression);
  const mapProperty = call?.getExpression().asKind(SyntaxKind.PropertyAccessExpression);
  if (call && mapProperty?.getName() === 'map') {
    const source = context.evaluator.evaluate(mapProperty.getExpression());
    const callback = call.getArguments()[0];
    if (
      source.known &&
      Array.isArray(source.value) &&
      (callback?.isKind(SyntaxKind.ArrowFunction) ||
        callback?.isKind(SyntaxKind.FunctionExpression))
    ) {
      const parameter = callback.getParameters()[0]?.getName();
      const directBody = unwrapNode(callback.getBody()).asKind(SyntaxKind.ObjectLiteralExpression);
      const returnedBody = callback
        .getBody()
        .asKind(SyntaxKind.Block)
        ?.getDescendantsOfKind(SyntaxKind.ReturnStatement)[0]
        ?.getExpression()
        ?.asKind(SyntaxKind.ObjectLiteralExpression);
      const object = directBody ?? returnedBody;
      if (parameter && object)
        return source.value.flatMap((item) => {
          const option = optionFromObject(object, new Map([[parameter, item]]));
          return option ? [option] : [];
        });
    }
  }
  const array = resolved?.asKind(SyntaxKind.ArrayLiteralExpression);
  if (!array) return [];
  return array.getElements().flatMap((element) => {
    if (element.isKind(SyntaxKind.SpreadElement))
      return optionsFromNode(element.getExpression(), context);
    const object = resolveNode(element, context.session.checker)?.asKind(
      SyntaxKind.ObjectLiteralExpression
    );
    if (!object) return [];
    const option = optionFromObject(object);
    return option ? [option] : [];
  });
};

const optionTypeFrom = (
  typeNode: Node | undefined,
  rawType: unknown,
  profile: SourceProfile
): OptionTypeName | undefined => {
  const syntaxNames = typeNode
    ? [typeNode, ...typeNode.getDescendants()]
        .flatMap((node) =>
          node.isKind(SyntaxKind.PropertyAccessExpression) ? [node.getName()] : []
        )
        .filter((name): name is OptionTypeName =>
          Object.values(profile.optionTypes).includes(name as OptionTypeName)
        )
    : [];
  return (
    syntaxNames.find((name) => name !== 'COMPONENT' && name !== 'CUSTOM') ??
    syntaxNames[0] ??
    (typeof rawType === 'number' ? profile.optionTypes[rawType] : undefined) ??
    (typeof rawType === 'string' &&
    Object.values(profile.optionTypes).includes(rawType as OptionTypeName)
      ? (rawType as OptionTypeName)
      : undefined)
  );
};

const settingNodeMap = (
  node: Node | undefined,
  checker: TypeChecker,
  evaluator: StaticEvaluator,
  visited = new Set<string>()
): Map<string, ObjectLiteralExpression> => {
  const output = new Map<string, ObjectLiteralExpression>();
  const resolved = resolveNode(node, checker);
  if (!resolved) return output;
  const key = `${resolved.getSourceFile().getFilePath()}:${resolved.getStart()}`;
  if (visited.has(key)) return output;
  visited.add(key);
  const object = resolved.asKind(SyntaxKind.ObjectLiteralExpression);
  if (!object) return output;
  for (const property of object.getProperties()) {
    if (property.isKind(SyntaxKind.SpreadAssignment)) {
      for (const [name, value] of settingNodeMap(
        property.getExpression(),
        checker,
        evaluator,
        visited
      ))
        output.set(name, value);
      continue;
    }
    if (!property.isKind(SyntaxKind.PropertyAssignment)) continue;
    const nameNode = property.getNameNode();
    const nameResult = evaluator.evaluate(nameNode);
    const name =
      nameResult.known && ['string', 'number'].includes(typeof nameResult.value)
        ? String(nameResult.value)
        : property.getName().replace(/^['"]|['"]$/g, '');
    const value = resolveNode(property.getInitializer(), checker)?.asKind(
      SyntaxKind.ObjectLiteralExpression
    );
    if (value) output.set(name, value);
  }
  return output;
};

const propertyKey = (node: Node, evaluator: StaticEvaluator): string | undefined => {
  if (
    node.isKind(SyntaxKind.Identifier) ||
    node.isKind(SyntaxKind.StringLiteral) ||
    node.isKind(SyntaxKind.NumericLiteral)
  )
    return node.getText().replace(/^['"]|['"]$/g, '');
  const computed = node.asKind(SyntaxKind.ComputedPropertyName)?.getExpression();
  const result = evaluator.evaluate(computed ?? node);
  if (result.known && (typeof result.value === 'string' || typeof result.value === 'number'))
    return String(result.value);
  return undefined;
};

const rawObjectFromAst = (
  object: ObjectLiteralExpression,
  checker: TypeChecker,
  evaluator: StaticEvaluator,
  visited = new Set<string>()
): RawRecord => {
  const visitKey = `${object.getSourceFile().getFilePath()}:${object.getStart()}`;
  if (visited.has(visitKey)) return {};
  visited.add(visitKey);
  const output: RawRecord = {};
  for (const property of object.getProperties()) {
    if (property.isKind(SyntaxKind.SpreadAssignment)) {
      const spread = evaluator.evaluate(property.getExpression());
      if (spread.known && isRecord(spread.value)) Object.assign(output, spread.value);
      continue;
    }
    if (property.isKind(SyntaxKind.ShorthandPropertyAssignment)) {
      const result = evaluator.evaluate(property.getNameNode());
      if (result.known) output[property.getName()] = result.value;
      continue;
    }
    if (!property.isKind(SyntaxKind.PropertyAssignment)) continue;
    const key = propertyKey(property.getNameNode(), evaluator);
    if (key === undefined) continue;
    const initializer = resolveNode(property.getInitializer(), checker);
    const nested = initializer?.asKind(SyntaxKind.ObjectLiteralExpression);
    if (nested) {
      output[key] = rawObjectFromAst(nested, checker, evaluator, visited);
      continue;
    }
    if (!initializer) continue;
    const result = evaluator.evaluate(initializer);
    if (result.known) output[key] = result.value;
  }
  // `visited` is a recursion stack, not a global deduplication set. The same definition object may
  // legitimately be reused by multiple settings; keeping it marked after this branch returns would
  // cause every later reference to lose its default and metadata.
  visited.delete(visitKey);
  return output;
};

const rawSettingsFromArgument = (
  argument: Node,
  checker: TypeChecker,
  evaluator: StaticEvaluator
): RawRecord | undefined => {
  const resolved = resolveNode(argument, checker);
  const object = resolved?.asKind(SyntaxKind.ObjectLiteralExpression);
  return object ? rawObjectFromAst(object, checker, evaluator) : undefined;
};

const componentInitializer = (
  definitionNode: ObjectLiteralExpression | undefined
): Node | undefined => {
  const property = definitionNode?.getProperty('component');
  if (property?.isKind(SyntaxKind.MethodDeclaration)) return property;
  return property?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
};

const nestedConfigFromDefaults = (
  name: string,
  defaults: Readonly<Record<string, StaticValue>>,
  labels: Readonly<Record<string, string>> | undefined,
  profile: SourceProfile
): PluginConfig => ({
  name,
  settings: Object.fromEntries(
    Object.entries(defaults).map(([entryName, value]) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const label = labels?.[entryName];
        const parentDescription = label
          ? `${label}${profile.structuredComponentDescriptions.parentSuffix}`
          : undefined;
        const children = Object.fromEntries(
          Object.entries(value).flatMap(([childName, childValue]) => {
            const converted = jsonValue(childValue);
            return converted.valid
              ? [
                  [
                    childName,
                    {
                      name: childName,
                      type: inferTypeFromValue(converted.value),
                      default: converted.value,
                      ...(parentDescription &&
                      profile.structuredComponentDescriptions.childTemplates[childName]
                        ? {
                            description: profile.structuredComponentDescriptions.childTemplates[
                              childName
                            ].replace('{parent}', parentDescription),
                          }
                        : {}),
                    } satisfies PluginSetting,
                  ],
                ]
              : [];
          })
        );
        return [
          entryName,
          {
            name: entryName,
            ...(parentDescription ? { description: parentDescription } : {}),
            settings: children,
          } satisfies PluginConfig,
        ];
      }
      const converted = jsonValue(value);
      return [
        entryName,
        {
          name: entryName,
          type: inferTypeFromValue(converted.valid ? converted.value : undefined),
          ...(converted.valid ? { default: converted.value } : {}),
        } satisfies PluginSetting,
      ];
    })
  ),
});

const implicitDefaultForType = (type: SettingType): Partial<Pick<PluginSetting, 'default'>> => {
  if (type.kind === 'string' && type.nullable) return { default: null };
  if (type.kind === 'list') return { default: [] };
  if (type.kind === 'attrs') return { default: type.nullable ? null : {} };
  return {};
};

const settingFromComponentTrace = (
  key: string,
  trace: ReturnType<typeof traceComponentSetting>,
  metadata: Pick<PluginSetting, 'description' | 'placeholder' | 'hidden' | 'restartNeeded'>,
  profile: SourceProfile,
  contextualType: string | undefined,
  allowImplicitDefault: boolean
): PluginSetting | PluginConfig | undefined => {
  if (trace.nestedDefaults)
    return nestedConfigFromDefaults(key, trace.nestedDefaults, trace.nestedLabels, profile);
  if (!trace.persistent) return undefined;
  const control = trace.controls[0];
  let type: SettingType;
  if (control?.kind === 'boolean') type = { kind: 'boolean' };
  else if (control?.kind === 'number') type = { kind: 'float' };
  else if (control?.kind === 'enum' && control.values?.length)
    type = { kind: 'enum', values: control.values };
  else if (trace.hasDefault) {
    const converted = jsonValue(trace.defaultValue);
    type = inferTypeFromValue(converted.valid ? converted.value : undefined);
  } else type = inferTypeFromValue(undefined, contextualType);
  const converted = jsonValue(trace.defaultValue);
  return {
    name: key,
    type,
    ...metadata,
    ...(trace.hasDefault && converted.valid
      ? { default: converted.value }
      : allowImplicitDefault
        ? implicitDefaultForType(type)
        : {}),
  };
};

async function normalizeSetting(
  key: string,
  raw: RawRecord,
  definitionNode: ObjectLiteralExpression | undefined,
  context: PluginContext,
  pluginName: string,
  settingPath: string,
  settingsBindings: readonly Node[] = []
): Promise<PluginSetting | PluginConfig | undefined> {
  const definitionKeys = new Set([
    'type',
    'default',
    'description',
    'name',
    'options',
    'component',
    'placeholder',
    'restartNeeded',
    'hidden',
  ]);
  const isDefinition =
    Object.keys(raw).some((name) => definitionKeys.has(name)) ||
    Boolean(
      definitionNode?.getProperties().some((property) => {
        if (
          !property.isKind(SyntaxKind.PropertyAssignment) &&
          !property.isKind(SyntaxKind.MethodDeclaration) &&
          !property.isKind(SyntaxKind.GetAccessor)
        )
          return false;
        return definitionKeys.has(property.getName().replace(/^['"]|['"]$/g, ''));
      })
    );
  if (!isDefinition) {
    const nestedEntries = await Promise.all(
      Object.entries(raw).map(async ([childKey, child]) =>
        isRecord(child)
          ? ([
              childKey,
              await normalizeSetting(
                childKey,
                child,
                undefined,
                context,
                pluginName,
                `${settingPath}.${childKey}`,
                settingsBindings
              ),
            ] as const)
          : ([childKey, undefined] as const)
      )
    );
    return {
      name: key,
      settings: Object.fromEntries(
        nestedEntries.filter(
          (entry): entry is readonly [string, PluginSetting | PluginConfig] =>
            entry[1] !== undefined
        )
      ),
    };
  }

  if (raw.hidden === true && !context.profile.includeHiddenSettings) {
    context.diagnostics.push(
      diagnostic(
        'hidden-setting-skipped',
        'info',
        'normalization',
        'Hidden setting omitted by source profile',
        {
          pluginName,
          settingPath,
          ...(definitionNode ? { node: definitionNode } : {}),
        }
      )
    );
    return undefined;
  }

  const metadata = {
    ...(typeof raw.description === 'string'
      ? { description: raw.description }
      : typeof raw.name === 'string'
        ? { description: raw.name }
        : {}),
    ...(typeof raw.placeholder === 'string' ? { placeholder: raw.placeholder } : {}),
    ...(raw.hidden === true ? { hidden: true } : {}),
    ...(raw.restartNeeded === true ? { restartNeeded: true } : {}),
  };
  const defaultNode = objectPropertyInitializer(definitionNode, 'default');
  const convertedDefault = jsonValue(raw.default);
  const hasDeclaredDefault = Object.hasOwn(raw, 'default');
  const hasDefault = hasDeclaredDefault && convertedDefault.valid;
  if (hasDeclaredDefault && !convertedDefault.valid) {
    context.diagnostics.push(
      diagnostic(
        'unsupported-default-value',
        'warning',
        'normalization',
        'Default value is not finite or JSON-serializable and was omitted',
        {
          pluginName,
          settingPath,
          ...(defaultNode ? { node: defaultNode } : {}),
        }
      )
    );
  }
  const typeNode = objectPropertyInitializer(definitionNode, 'type');
  const optionType = optionTypeFrom(typeNode, raw.type, context.profile);
  const component = componentInitializer(definitionNode);
  const contextualType = explicitTypeText(defaultNode, context.session.checker);
  const hasSourceDefault =
    Object.hasOwn(raw, 'default') || Boolean(definitionNode?.getProperty('default'));

  if ((optionType === 'COMPONENT' || optionType === 'CUSTOM') && !hasDefault && component) {
    let trace = traceComponentSetting(
      component,
      key,
      context.session.checker,
      context.evaluator,
      context.profile.controlComponents,
      context.pluginPath,
      settingsBindings
    );
    if (!trace.persistent) {
      const pluginTrace = traceStoreSetting(
        context.sourceFiles,
        key,
        context.session.checker,
        context.evaluator,
        settingsBindings
      );
      if (pluginTrace.persistent) trace = pluginTrace;
    }
    const traced = settingFromComponentTrace(
      key,
      trace,
      metadata,
      context.profile,
      contextualType,
      !hasSourceDefault
    );
    if (traced) return traced;

    if (context.executionMode === 'fallback' && trace.storeReferenced) {
      const executed = await context.executionLimit(() =>
        executeComponentSlice(component, context.session.checker, {
          settingKey: key,
          allowedRoot: context.pluginPath,
        })
      );
      if (executed.ok) {
        const readsSetting = executed.events.some(
          (event) => event.kind === 'read' && event.path?.[0] === key
        );
        const writes = executed.events.filter(
          (event) => event.kind === 'write' && event.path?.[0] === key
        );
        if (readsSetting && writes.length > 0) {
          const controlKind = executed.events.flatMap((event) => {
            if (event.kind !== 'control' || !event.component) return [];
            const component = event.component.split('.').at(-1);
            const kind = component ? context.profile.controlComponents[component] : undefined;
            return kind ? [kind] : [];
          })[0];
          const convertedDefault = jsonValue(executed.value);
          const convertedWrite = jsonValue(writes.at(-1)?.value);
          const type: SettingType =
            controlKind === 'boolean'
              ? { kind: 'boolean' }
              : controlKind === 'number'
                ? { kind: 'float' }
                : executed.hasDefault && convertedDefault.valid
                  ? inferTypeFromValue(convertedDefault.value, contextualType)
                  : convertedWrite.valid
                    ? inferTypeFromValue(convertedWrite.value, contextualType)
                    : inferTypeFromValue(undefined, contextualType);
          return {
            name: key,
            type,
            ...metadata,
            ...(executed.hasDefault && convertedDefault.valid
              ? { default: convertedDefault.value }
              : !hasSourceDefault
                ? implicitDefaultForType(type)
                : {}),
          };
        }
      } else {
        context.diagnostics.push(
          diagnostic(executed.code, 'warning', 'execution', executed.message, {
            pluginName,
            settingPath,
            node: component,
            evidence: executed.evidence,
          })
        );
      }
    }

    context.diagnostics.push(
      diagnostic(
        'component-ui-only',
        'info',
        'normalization',
        'Component has no persistent store or recognized control evidence',
        {
          pluginName,
          settingPath,
          node: component,
          evidence: trace.evidence,
        }
      )
    );
    return undefined;
  }

  const options = rawOptions(raw.options);
  const optionsNode = objectPropertyInitializer(definitionNode, 'options');
  const resolvedOptions = options.length > 0 ? options : optionsFromNode(optionsNode, context);
  let contextualEnumValues: readonly SettingScalar[] | undefined;
  if (
    resolvedOptions.length === 0 &&
    defaultNode &&
    (optionType === 'CUSTOM' || optionType === 'COMPONENT')
  ) {
    try {
      contextualEnumValues = enumValuesFromType(
        defaultNode,
        context.session.checker,
        context.profile
      );
    } catch {}
  }
  const rule = applySettingRule({
    optionType,
    hasDefault,
    ...(hasDefault ? { defaultValue: convertedDefault.value } : {}),
    options:
      contextualEnumValues && contextualEnumValues.length > 1
        ? contextualEnumValues.map((value) => ({
            value,
            isDefault: hasDefault && convertedDefault.value === value,
          }))
        : resolvedOptions,
    contextualType,
  });
  return {
    name: key,
    type: rule.type,
    ...metadata,
    ...(rule.hasDefault && rule.defaultValue !== undefined ? { default: rule.defaultValue } : {}),
  };
}

const enumValuesFromType = (
  typeNode: Node,
  checker: TypeChecker,
  profile: SourceProfile
): readonly SettingScalar[] | undefined => {
  const explicitTypeNode =
    typeNode.asKind(SyntaxKind.AsExpression)?.getTypeNode() ??
    typeNode.asKind(SyntaxKind.TypeAssertionExpression)?.getTypeNode() ??
    typeNode;
  const literalValues = (node: Node): SettingScalar[] => {
    if (node.isKind(SyntaxKind.UnionType)) return node.getTypeNodes().flatMap(literalValues);
    if (node.isKind(SyntaxKind.LiteralType)) {
      const literal = node.getLiteral();
      if (literal.isKind(SyntaxKind.StringLiteral)) return [literal.getLiteralValue()];
      if (literal.isKind(SyntaxKind.NumericLiteral)) return [literal.getLiteralValue()];
      if (literal.isKind(SyntaxKind.TrueKeyword)) return [true];
      if (literal.isKind(SyntaxKind.FalseKeyword)) return [false];
    }
    return [];
  };
  const directLiterals = literalValues(explicitTypeNode);
  if (directLiterals.length > 0) return directLiterals;
  try {
    const referenceName = explicitTypeNode.asKind(SyntaxKind.TypeReference)?.getTypeName();
    const symbol = referenceName
      ? (checker.getSymbolAtLocation(referenceName) ?? referenceName.getSymbol())
      : undefined;
    const resolved = symbol?.isAlias() ? symbol.getAliasedSymbol() : symbol;
    for (const declaration of resolved?.getDeclarations() ?? []) {
      if (declaration.isKind(SyntaxKind.TypeAliasDeclaration)) {
        const aliasType = declaration.getTypeNode();
        const values = aliasType ? literalValues(aliasType) : [];
        if (values.length > 0) return values;
      }
    }
  } catch {}
  const type = checker.getTypeAtLocation(typeNode);
  const unionValues = type
    .getUnionTypes()
    .map((item): unknown => item.getLiteralValue())
    .filter(
      (value): value is SettingScalar =>
        typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    );
  if (unionValues.length > 0) return unionValues;
  const symbol = type.getSymbol() ?? type.getAliasSymbol();
  const declaration = symbol?.getDeclarations()[0];
  if (declaration?.isKind(SyntaxKind.EnumDeclaration)) {
    const values = declaration.getMembers().map((member) => member.getValue());
    if (
      values.every(
        (value): value is string | number => typeof value === 'string' || typeof value === 'number'
      )
    )
      return values;
  }
  const typeName = typeNode
    .getText()
    .split('.')
    .at(-1)
    ?.replace(/[^A-Za-z0-9_$].*$/, '');
  return typeName ? profile.enumFallbacks[typeName] : undefined;
};

const privateSettingsFromTypeLiteral = (
  literal: TypeLiteralNode,
  context: PluginContext
): Record<string, PluginSetting | PluginConfig> => {
  const output: Record<string, PluginSetting | PluginConfig> = {};
  for (const member of literal.getMembers()) {
    const property = member.asKind(SyntaxKind.PropertySignature);
    if (!property) continue;
    const name = property.getName().replace(/^['"]|['"]$/g, '');
    const typeNode = property.getTypeNode();
    const nested = typeNode?.asKind(SyntaxKind.TypeLiteral);
    if (nested) {
      output[name] = { name, settings: privateSettingsFromTypeLiteral(nested, context) };
      continue;
    }
    if (!typeNode) {
      output[name] = { name, type: { kind: 'attrs', nullable: false }, default: {} };
      continue;
    }
    const text = typeNode.getText().replace(/\s+/g, ' ');
    const enumValues = enumValuesFromType(typeNode, context.session.checker, context.profile);
    if (enumValues?.length) {
      output[name] = {
        name,
        type:
          enumValues.length === 2 && enumValues.includes(true) && enumValues.includes(false)
            ? { kind: 'boolean' }
            : { kind: 'enum', values: enumValues },
        default: enumValues.includes(false) ? false : enumValues[0],
      };
    } else if (/^(?:string\[\]|Array\s*<\s*string\s*>)/.test(text)) {
      output[name] = { name, type: { kind: 'list', element: 'string' }, default: [] };
    } else if (/^(?:Record\s*<|\{)/.test(text)) {
      output[name] = { name, type: { kind: 'attrs', nullable: false }, default: {} };
    } else {
      const type = context.session.checker.getTypeAtLocation(typeNode);
      if (type.isBoolean() || text.includes('boolean'))
        output[name] = { name, type: { kind: 'boolean' }, default: false };
      else if (type.isNumber() || text.includes('number'))
        output[name] = { name, type: { kind: 'integer' }, default: 0 };
      else if (type.isArray() || type.isTuple())
        output[name] = { name, type: { kind: 'list', element: 'attrs' }, default: [] };
      else output[name] = { name, type: { kind: 'string', nullable: true }, default: null };
    }
  }
  return output;
};

const privateSettings = (
  settingsCall: CallExpression,
  context: PluginContext
): Record<string, PluginSetting | PluginConfig> => {
  const property = settingsCall.getParentIfKind(SyntaxKind.PropertyAccessExpression);
  const chained = property?.getParentIfKind(SyntaxKind.CallExpression);
  if (property?.getName() !== 'withPrivateSettings') return {};
  const literal = chained?.getTypeArguments()[0]?.asKind(SyntaxKind.TypeLiteral);
  return literal ? privateSettingsFromTypeLiteral(literal, context) : {};
};

async function extractSettings(
  settingsCall: CallExpression,
  context: PluginContext,
  pluginName: string
): Promise<Record<string, PluginSetting | PluginConfig>> {
  const argument = settingsCall.getArguments()[0];
  if (!argument) return privateSettings(settingsCall, context);
  const directSettings = rawSettingsFromArgument(
    argument,
    context.session.checker,
    context.evaluator
  );
  const result = directSettings ? undefined : context.evaluator.evaluate(argument);
  const rawSettings =
    directSettings ?? (result?.known && isRecord(result.value) ? result.value : undefined);
  if (!rawSettings) {
    context.diagnostics.push(
      diagnostic(
        'unsupported-settings-expression',
        'warning',
        'evaluation',
        result?.known
          ? 'Settings expression did not evaluate to an object'
          : (result?.reason ?? 'Settings expression is unresolved'),
        {
          pluginName,
          node: argument,
          evidence: result?.evidence.map(
            (item) => `${item.file}:${item.line}:${item.column} ${item.kind}`
          ),
        }
      )
    );
    return privateSettings(settingsCall, context);
  }
  const nodeMap = settingNodeMap(argument, context.session.checker, context.evaluator);
  const settingsBindings = settingsBindingsForCall(settingsCall);
  const entries = await Promise.all(
    Object.keys(rawSettings).map(async (key) => {
      try {
        const value = rawSettings[key];
        if (!isRecord(value)) return [key, undefined] as const;
        const normalized = await normalizeSetting(
          key,
          value,
          nodeMap.get(key),
          context,
          pluginName,
          key,
          settingsBindings
        );
        return [normalized?.name ?? key, normalized] as const;
      } catch (error) {
        context.diagnostics.push(
          diagnostic(
            'setting-analysis-failed',
            'warning',
            'normalization',
            error instanceof Error ? error.message : String(error),
            {
              pluginName,
              settingPath: key,
              ...(nodeMap.get(key) ? { node: nodeMap.get(key) } : {}),
            }
          )
        );
        return [key, undefined] as const;
      }
    })
  );
  return {
    ...Object.fromEntries(
      entries.filter(
        (entry): entry is readonly [string, PluginSetting | PluginConfig] => entry[1] !== undefined
      )
    ),
    ...privateSettings(settingsCall, context),
  };
}

const literalStringArgs = (call: CallExpression, evaluator: StaticEvaluator): string[] =>
  call.getArguments().flatMap((argument) => {
    const value = evaluated(argument, evaluator);
    return typeof value === 'string' ? [value] : [];
  });

const extractRenames = (
  sourceFiles: readonly SourceFile[],
  context: PluginContext
): { settingRenames: SettingRename[]; pluginRenames: PluginRename[] } => {
  const settingRenames = apiCalls(
    sourceFiles,
    'migratePluginSetting',
    context.profile,
    context.session.checker
  ).flatMap((call) => {
    const [pluginName, oldSetting, newSetting] = literalStringArgs(call, context.evaluator);
    return pluginName && oldSetting && newSetting ? [{ pluginName, oldSetting, newSetting }] : [];
  });
  const pluginRenames = apiCalls(
    sourceFiles,
    'migratePluginSettings',
    context.profile,
    context.session.checker
  ).flatMap((call) => {
    const [newName, ...oldNames] = literalStringArgs(call, context.evaluator);
    return newName ? oldNames.map((oldName) => ({ oldName, newName })) : [];
  });
  return { settingRenames, pluginRenames };
};

async function parseSinglePlugin(
  pluginDir: string,
  pluginPath: string,
  entry: SourceFile,
  sourceFiles: readonly SourceFile[],
  baseContext: Omit<PluginContext, 'pluginDir' | 'pluginPath' | 'sourceFiles' | 'diagnostics'>
): Promise<PluginParseResult> {
  const diagnostics: ParseDiagnostic[] = [];
  const context: PluginContext = {
    ...baseContext,
    pluginDir,
    pluginPath,
    sourceFiles,
    diagnostics,
  };
  try {
    const definePluginCall = findDefinePluginCall(entry, context.profile, context.session.checker);
    if (!definePluginCall) {
      diagnostics.push(
        diagnostic(
          'plugin-definition-missing',
          'error',
          'discovery',
          `Entry ${pluginDir} does not call the canonical definePlugin API`,
          { pluginName: pluginDir, node: entry }
        )
      );
      return { settingRenames: [], pluginRenames: [], diagnostics };
    }
    const pluginObject = objectArgument(definePluginCall);
    const infoName = evaluated(objectPropertyInitializer(pluginObject, 'name'), context.evaluator);
    const description = evaluated(
      objectPropertyInitializer(pluginObject, 'description'),
      context.evaluator
    );
    const isModified = evaluated(
      objectPropertyInitializer(pluginObject, 'isModified'),
      context.evaluator
    );
    const pluginName = inferPluginName(
      pluginDir,
      typeof infoName === 'string' ? infoName : undefined
    );
    const settingsCall = findSettingsCall(
      definePluginCall,
      sourceFiles,
      context.profile,
      context.session.checker
    );
    let settings = settingsCall ? await extractSettings(settingsCall, context, pluginName) : {};
    if (!settingsCall) {
      const inlineOptions = objectPropertyInitializer(pluginObject, 'options');
      if (inlineOptions) {
        const fakeResult = context.evaluator.evaluate(inlineOptions);
        if (fakeResult.known && isRecord(fakeResult.value)) {
          const nodeMap = settingNodeMap(inlineOptions, context.session.checker, context.evaluator);
          const pairs = await Promise.all(
            Object.entries(fakeResult.value).map(
              async ([key, value]) =>
                [
                  key,
                  isRecord(value)
                    ? await normalizeSetting(key, value, nodeMap.get(key), context, pluginName, key)
                    : undefined,
                ] as const
            )
          );
          settings = Object.fromEntries(pairs.filter((pair) => pair[1] !== undefined)) as Record<
            string,
            PluginSetting | PluginConfig
          >;
        }
      }
    }
    const renames = extractRenames(sourceFiles, context);
    return {
      entry: [
        pluginName,
        {
          name: pluginName,
          settings,
          directoryName: pluginDir,
          ...(typeof description === 'string' ? { description } : {}),
          ...(typeof isModified === 'boolean' ? { isModified } : {}),
        },
      ],
      ...renames,
      diagnostics,
    };
  } catch (error) {
    diagnostics.push(
      diagnostic(
        'plugin-analysis-failed',
        'error',
        'evaluation',
        `Failed to parse ${pluginDir}: ${error instanceof Error ? error.message : String(error)}`,
        { pluginName: pluginDir, node: entry }
      )
    );
    return { settingRenames: [], pluginRenames: [], diagnostics };
  }
}

async function parsePluginsFromDirectory(
  pluginsPath: string,
  profile: SourceProfile,
  session: AnalysisSession,
  executionMode: 'disabled' | 'fallback'
): Promise<DirectoryParseResult> {
  const entryFiles = await fg([...profile.entryGlobs], {
    cwd: pluginsPath,
    absolute: true,
    onlyFiles: true,
  });
  const entries = entryFiles
    .map((file) => {
      const relativeEntry = normalize(relative(pluginsPath, file));
      const isDirectoryEntry = /^index\.(?:ts|tsx)$/.test(basename(relativeEntry));
      return {
        file: normalize(file),
        pluginDir: isDirectoryEntry ? dirname(relativeEntry) : relativeEntry,
        sourceRoot: normalize(dirname(file)),
        isDirectoryEntry,
      };
    })
    .filter((entry) => entry.pluginDir !== '.')
    .sort((left, right) => left.pluginDir.localeCompare(right.pluginDir));
  if (!process.stdout.isTTY)
    console.log(`Found ${entries.length} plugin entries in ${basename(pluginsPath)}`);

  const executionLimit = pLimit(EXECUTION_CONCURRENCY);
  const evaluator = new StaticEvaluator(session.checker, {
    constants: Object.fromEntries(
      Object.entries(profile.enumMemberFallbacks).flatMap(([enumName, members]) =>
        Object.entries(members).map(([memberName, value]) => [`${enumName}.${memberName}`, value])
      )
    ),
  });
  const results: PluginParseResult[] = [];
  for (let index = 0; index < entries.length; index++) {
    const { file, pluginDir, sourceRoot, isDirectoryEntry } = entries[index];
    const entry = session.getSourceFile(file);
    if (!entry) continue;
    const pluginFiles = isDirectoryEntry
      ? session.sourceFiles.filter((sourceFile) =>
          sourceFile.getFilePath().startsWith(`${sourceRoot}/`)
        )
      : [entry];
    results.push(
      await parseSinglePlugin(pluginDir, sourceRoot, entry, pluginFiles, {
        profile,
        session,
        evaluator,
        executionMode,
        executionLimit,
      })
    );
    if (!process.stdout.isTTY && (index + 1) % PROGRESS_REPORT_INTERVAL === 0)
      console.log(`Processed ${index + 1}/${entries.length} plugins...`);
  }

  return {
    plugins: Object.fromEntries(
      results.flatMap((result) => (result.entry ? [result.entry] : []))
    ) as ReadonlyDeep<Record<string, PluginConfig>>,
    settingRenames: results.flatMap((result) => result.settingRenames),
    pluginRenames: results.flatMap((result) => result.pluginRenames),
    diagnostics: results.flatMap((result) => result.diagnostics),
  };
}

const sourceFilesForAnalysis = async (
  sourcePath: string,
  pluginDirectories: readonly string[]
): Promise<string[]> => {
  const profiles = Object.values(SOURCE_PROFILES);
  const globs = [
    ...pluginDirectories.map((directory) => `${directory}/**/*.{ts,tsx}`),
    ...profiles.flatMap((profile) => profile.supportGlobs),
  ];
  return (await fg(globs, { cwd: sourcePath, absolute: true, onlyFiles: true })).sort((a, b) =>
    a.localeCompare(b)
  );
};

export async function parsePlugins(
  sourcePath: string,
  options: ParsePluginsOptions = {}
): Promise<ParsedPluginsResult> {
  sourcePath = resolve(sourcePath);
  const validated = ParsePluginsOptionsSchema.parse(options);
  const vencordPluginsDir = validated.vencordPluginsDir ?? CLI_CONFIG.directories.vencordPlugins;
  const equicordPluginsDir = validated.equicordPluginsDir ?? CLI_CONFIG.directories.equicordPlugins;
  const pluginsPath = normalize(join(sourcePath, vencordPluginsDir));
  const equicordPluginsPath = normalize(join(sourcePath, equicordPluginsDir));
  const [hasVencord, hasEquicord] = await Promise.all([
    fse.pathExists(pluginsPath),
    fse.pathExists(equicordPluginsPath),
  ]);
  if (!hasVencord && !hasEquicord) {
    throw new Error(
      `No plugins directories found. Expected one of:\n  - ${pluginsPath}\n  - ${equicordPluginsPath}`
    );
  }

  const filePaths = await sourceFilesForAnalysis(
    sourcePath,
    [hasVencord ? vencordPluginsDir : '', hasEquicord ? equicordPluginsDir : ''].filter(Boolean)
  );
  const session = await createAnalysisSession({
    rootPath: sourcePath,
    filePaths,
    tsConfigPath: normalize(join(sourcePath, 'tsconfig.json')),
  });
  const executionMode = validated.executionMode ?? 'fallback';
  const vencordResult = hasVencord
    ? await parsePluginsFromDirectory(pluginsPath, SOURCE_PROFILES.vencord, session, executionMode)
    : emptyDirectoryResult();
  const equicordResult = hasEquicord
    ? await parsePluginsFromDirectory(
        equicordPluginsPath,
        SOURCE_PROFILES.equicord,
        session,
        executionMode
      )
    : emptyDirectoryResult();

  return {
    vencordPlugins: vencordResult.plugins,
    equicordPlugins: equicordResult.plugins,
    settingRenames: [...vencordResult.settingRenames, ...equicordResult.settingRenames],
    pluginRenames: [...vencordResult.pluginRenames, ...equicordResult.pluginRenames],
    diagnostics: [...vencordResult.diagnostics, ...equicordResult.diagnostics],
  };
}
