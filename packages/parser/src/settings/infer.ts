import type { PluginConfig, PluginSetting, SettingScalar, SettingType } from '@nixcord/domain';
import {
  type CallExpression,
  Node,
  type ObjectLiteralExpression,
  resolvedDeclaration,
  type StaticEvaluator,
  type StaticValue,
  SyntaxKind,
  type Type,
  type TypeChecker,
  unwrapExpression,
} from '@nixcord/typescript-analysis';
import { diagnostic, type PluginContext } from '../context.js';
import type { OptionTypeName, SourceProfile } from '../profiles.js';
import { importIdentity, objectPropertyInitializer, resolveNode } from '../resolve.js';
import { isRecord, propertyKey } from './extract.js';
import { type DefaultEvidence, inferTypeFromValue, type SelectOption } from './rules.js';
import { checkedTypeContext, sourceTypeContext, type TypeContext } from './type-context.js';

// Infer option values and private schemas without executing components
export const explicitTypeContext = async (
  node: Node | undefined,
  checker: TypeChecker,
  visited = new Set<Node>()
): Promise<TypeContext | undefined> => {
  if (!node || visited.has(node)) return undefined;
  visited.add(node);
  try {
    const type = await checker.getTypeAtLocation(node);
    if (!type.isAny()) return checkedTypeContext(type);

    // Unresolved upstream types still carry useful source annotations
    const unwrapped = node.isKind(SyntaxKind.ParenthesizedExpression) ? node.getExpression() : node;
    const assertedType =
      unwrapped.asKind(SyntaxKind.AsExpression)?.getTypeNode() ??
      unwrapped.asKind(SyntaxKind.TypeAssertionExpression)?.getTypeNode() ??
      unwrapped.asKind(SyntaxKind.SatisfiesExpression)?.getTypeNode();
    if (assertedType) return sourceTypeContext(assertedType);
    const declaration = resolvedDeclaration(unwrapped, checker);
    if (declaration?.isKind(SyntaxKind.VariableDeclaration)) {
      const annotation = declaration.getTypeNode();
      return annotation
        ? sourceTypeContext(annotation)
        : explicitTypeContext(declaration.getInitializer(), checker, visited);
    }
  } catch {}
  return undefined;
};

export const rawOptions = (value: unknown): SelectOption[] =>
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
  const property = unwrapExpression(node).asKind(SyntaxKind.PropertyAccessExpression);
  if (!property) return undefined;
  const enumName = property.getExpression().getText().split('.').at(-1);
  return enumName ? profile.enumMemberFallbacks[enumName]?.[property.getName()] : undefined;
};

interface SelectOptionsEvidence {
  readonly options: readonly SelectOption[];
  readonly complete: boolean;
  readonly defaultEvidence: DefaultEvidence;
}

const UNRESOLVED_OPTIONS: SelectOptionsEvidence = {
  options: [],
  complete: false,
  defaultEvidence: { kind: 'unresolved' },
};

const combineOptions = (parts: readonly SelectOptionsEvidence[]): SelectOptionsEvidence => ({
  options: parts.flatMap((part) => part.options),
  complete: parts.every((part) => part.complete),
  // Runtime selects the first flagged option, so an unknown prefix blocks it
  defaultEvidence: parts.find((part) => part.defaultEvidence.kind !== 'absent')
    ?.defaultEvidence ?? { kind: 'absent' },
});

export const optionsFromNode = (
  node: Node | undefined,
  context: PluginContext,
  active = new Set<Node>()
): SelectOptionsEvidence => {
  const resolved = resolveNode(node, context.session.checker);
  if (!resolved || active.has(resolved)) return UNRESOLVED_OPTIONS;
  active.add(resolved);
  try {
    const evaluated = context.evaluator.evaluate(resolved);
    if (evaluated.known && Array.isArray(evaluated.value)) {
      const options = rawOptions(evaluated.value);
      const selected = options.find((option) => option.isDefault);
      return {
        options,
        complete: options.length === evaluated.value.length,
        defaultEvidence: selected ? { kind: 'known', value: selected.value } : { kind: 'absent' },
      };
    }
    const optionFromObject = (
      object: ObjectLiteralExpression,
      bindings: ReadonlyMap<string, StaticValue> = new Map()
    ): SelectOptionsEvidence => {
      const value = scalarFromNode(
        objectPropertyInitializer(object, 'value'),
        context.evaluator,
        context.profile,
        bindings
      );
      if (value === undefined) return UNRESOLVED_OPTIONS;
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
        options: [
          {
            value,
            ...(typeof label === 'string' ? { label } : {}),
            isDefault: selected === true,
          },
        ],
        complete: true,
        defaultEvidence:
          selected === true
            ? { kind: 'known', value }
            : selected === undefined && object.getProperty('default')
              ? { kind: 'unresolved' }
              : { kind: 'absent' },
      };
    };
    const call = resolved.asKind(SyntaxKind.CallExpression);
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
        const parameters = callback.getParameters();
        const parameter = parameters[0]?.getNameNode().asKind(SyntaxKind.Identifier);
        const indexParameter = parameters[1]?.getNameNode().asKind(SyntaxKind.Identifier);
        const body = unwrapExpression(callback.getBody());
        const statements = body.asKind(SyntaxKind.Block)?.getStatements();
        const object =
          body.asKind(SyntaxKind.ObjectLiteralExpression) ??
          (statements?.length === 1
            ? statements[0]
                ?.asKind(SyntaxKind.ReturnStatement)
                ?.getExpression()
                ?.asKind(SyntaxKind.ObjectLiteralExpression)
            : undefined);
        if (parameter && object)
          return combineOptions(
            source.value.map((item, index) => {
              const bindings = new Map<string, StaticValue>([[parameter.getText(), item]]);
              if (indexParameter) bindings.set(indexParameter.getText(), index);
              return optionFromObject(object, bindings);
            })
          );
      }
    }
    const conditional = resolved.asKind(SyntaxKind.ConditionalExpression);
    if (conditional) {
      const condition = context.evaluator.evaluate(conditional.getCondition());
      if (condition.known)
        return optionsFromNode(
          condition.value ? conditional.getWhenTrue() : conditional.getWhenFalse(),
          context,
          active
        );
      const whenTrue = optionsFromNode(conditional.getWhenTrue(), context, active);
      const whenFalse = optionsFromNode(conditional.getWhenFalse(), context, active);
      const left = whenTrue.defaultEvidence;
      const right = whenFalse.defaultEvidence;
      const sameDefault =
        (left.kind === 'absent' && right.kind === 'absent') ||
        (left.kind === 'known' && right.kind === 'known' && left.value === right.value);
      return {
        options: [...whenTrue.options, ...whenFalse.options],
        complete: whenTrue.complete && whenFalse.complete,
        defaultEvidence: sameDefault ? left : { kind: 'unresolved' },
      };
    }
    const array = resolved.asKind(SyntaxKind.ArrayLiteralExpression);
    if (!array) return UNRESOLVED_OPTIONS;
    return combineOptions(
      array.getElements().map((element) => {
        if (element.isKind(SyntaxKind.SpreadElement))
          return optionsFromNode(element.getExpression(), context, active);
        const object = resolveNode(element, context.session.checker)?.asKind(
          SyntaxKind.ObjectLiteralExpression
        );
        return object ? optionFromObject(object) : UNRESOLVED_OPTIONS;
      })
    );
  } finally {
    active.delete(resolved);
  }
};

export const optionTypeFrom = (
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

export const implicitDefaultForType = (
  type: SettingType
): Partial<Pick<PluginSetting, 'default'>> => {
  if (type.kind === 'string' && type.nullable) return { default: null };
  if (type.kind === 'list') return { default: [] };
  if (type.kind === 'attrs') return { default: type.nullable ? null : {} };
  return {};
};

const scalarLiteralValue = (type: Type): SettingScalar | undefined => {
  const value = type.getLiteralValue();
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? value
    : undefined;
};

export const enumValuesFromType = async (
  typeNode: Node,
  checker: TypeChecker,
  profile: SourceProfile,
  checkedType?: Type
): Promise<readonly SettingScalar[] | undefined> => {
  const type = checkedType ?? (await checker.getTypeAtLocation(typeNode));
  const explicitTypeNode =
    typeNode.asKind(SyntaxKind.AsExpression)?.getTypeNode() ??
    typeNode.asKind(SyntaxKind.TypeAssertionExpression)?.getTypeNode() ??
    typeNode.asKind(SyntaxKind.SatisfiesExpression)?.getTypeNode() ??
    unwrapExpression(typeNode);
  const members = type.isUnion() ? await type.getUnionTypes() : [type];
  const values: SettingScalar[] = [];
  for (const member of members) {
    if (member.isNull() || member.isUndefined()) continue;
    const value = scalarLiteralValue(member);
    if (value === undefined) {
      values.length = 0;
      break;
    }
    values.push(value);
  }
  if (values.length > 0) {
    const aliasSymbol = await type.getAliasSymbol();
    const alias = (await aliasSymbol?.resolveDeclarations())?.find(Node.isTypeAliasDeclaration);
    const sourceUnion =
      explicitTypeNode.asKind(SyntaxKind.UnionType) ??
      alias?.getTypeNode()?.asKind(SyntaxKind.UnionType);
    if (!sourceUnion) return values;

    // Union source order controls presentation and the first implicit default
    const remaining = new Set(values);
    const ordered: SettingScalar[] = [];
    for (const memberType of await checker.getTypesAtLocations(sourceUnion.getTypeNodes())) {
      for (const member of memberType.isUnion() ? await memberType.getUnionTypes() : [memberType]) {
        const value = scalarLiteralValue(member);
        if (value !== undefined && remaining.delete(value)) ordered.push(value);
      }
    }
    return [...ordered, ...remaining];
  }

  // Source profiles cover enum declarations absent from the upstream checkout
  const typeNameNode = explicitTypeNode.asKind(SyntaxKind.TypeReference)?.getTypeName();
  const importedName = typeNameNode ? importIdentity(typeNameNode)?.importedName : undefined;
  const typeName =
    importedName && importedName !== '*' && importedName !== 'default'
      ? importedName
      : typeNameNode?.isKind(SyntaxKind.QualifiedName)
        ? typeNameNode.getRight().getText()
        : typeNameNode?.getText();
  return typeName ? profile.enumFallbacks[typeName] : undefined;
};

const privateSettingsFromType = async (
  type: Type,
  source: Node,
  context: PluginContext,
  pluginName: string,
  active = new Set<Type>(),
  parentPath = ''
): Promise<Record<string, PluginSetting | PluginConfig>> => {
  const output: Record<string, PluginSetting | PluginConfig> = {};
  active.add(type);
  for (const symbol of await type.getProperties()) {
    const declarations = await symbol.resolveDeclarations();
    if (
      declarations.length > 0 &&
      !declarations.some(
        (declaration) =>
          declaration.isKind(SyntaxKind.PropertySignature) ||
          declaration.isKind(SyntaxKind.PropertyDeclaration)
      )
    )
      continue;
    const name = symbol.getName();
    const property = declarations.find(Node.isPropertySignature);
    const typeNode = property?.getTypeNode() ?? source;
    // Ask for the symbol's instantiated type so aliases, inherited properties,
    // and generic substitutions keep the schema declared at the call site
    const checkedType = await (await symbol.getTypeAtLocation(source)).getNonNullableType();
    const path = parentPath ? `${parentPath}.${name}` : name;
    const structural =
      checkedType.isObject() &&
      !(await checkedType.isArray()) &&
      !(await checkedType.isTuple()) &&
      !(await checkedType.getStringIndexType()) &&
      !(await checkedType.getNumberIndexType()) &&
      (await checkedType.getCallSignatures()).length === 0 &&
      (await checkedType.getConstructSignatures()).length === 0 &&
      !(await (await checkedType.getSymbol())?.resolveDeclarations())?.some(
        Node.isClassDeclaration
      ) &&
      (await checkedType.getProperties()).length > 0;
    if (structural && !active.has(checkedType) && active.size < 32) {
      output[name] = {
        name,
        settings: await privateSettingsFromType(
          checkedType,
          typeNode,
          context,
          pluginName,
          active,
          path
        ),
      };
      continue;
    }
    if (structural) {
      context.diagnostics.push(
        diagnostic(
          'private-settings-recursion-limit',
          'warning',
          'normalization',
          'Recursive or excessively deep private schema was preserved as an attribute set',
          { pluginName, settingPath: path, node: typeNode }
        )
      );
    }
    const enumValues = await enumValuesFromType(
      typeNode,
      context.session.checker,
      context.profile,
      checkedType
    );
    if (enumValues?.length) {
      output[name] = {
        name,
        type:
          enumValues.length === 2 && enumValues.includes(true) && enumValues.includes(false)
            ? { kind: 'boolean' }
            : { kind: 'enum', values: enumValues },
      };
    } else {
      const inferred = inferTypeFromValue(undefined, await checkedTypeContext(checkedType));
      const type: SettingType = checkedType.isBoolean()
        ? { kind: 'boolean' }
        : checkedType.isNumber() || inferred.kind === 'float'
          ? { kind: 'integer' }
          : checkedType.isObject() &&
              !(await checkedType.isArray()) &&
              !(await checkedType.isTuple())
            ? { kind: 'attrs', nullable: false }
            : inferred.kind !== 'list' &&
                ((await checkedType.isArray()) || (await checkedType.isTuple()))
              ? { kind: 'list', element: 'attrs' }
              : inferred;
      // withPrivateSettings only changes types and installs no runtime defaults
      output[name] = { name, type };
    }
  }
  active.delete(type);
  return output;
};

export const privateSettings = async (
  settingsCall: CallExpression,
  context: PluginContext,
  pluginName: string
): Promise<Record<string, PluginSetting | PluginConfig>> => {
  const property = settingsCall.getParentIfKind(SyntaxKind.PropertyAccessExpression);
  const chained = property?.getParentIfKind(SyntaxKind.CallExpression);
  if (property?.getName() !== 'withPrivateSettings') return {};
  const typeNode = chained?.getTypeArguments()[0];
  if (!typeNode) return {};
  const type = await context.session.checker.getTypeAtLocation(typeNode);
  if (type.isAny() || type.isUnknown()) {
    context.diagnostics.push(
      diagnostic(
        'unresolved-private-settings-type',
        'warning',
        'normalization',
        'Private settings type could not be resolved',
        { pluginName, node: typeNode }
      )
    );
    return {};
  }
  return privateSettingsFromType(type, typeNode, context, pluginName);
};
