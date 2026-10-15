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
import { inferTypeFromValue, type SelectOption } from './rules.js';
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

export const optionsFromNode = (node: Node | undefined, context: PluginContext): SelectOption[] => {
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
      const directBody = unwrapExpression(callback.getBody()).asKind(
        SyntaxKind.ObjectLiteralExpression
      );
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
  const conditional = resolved?.asKind(SyntaxKind.ConditionalExpression);
  if (conditional)
    return [conditional.getWhenTrue(), conditional.getWhenFalse()].flatMap((branch) =>
      optionsFromNode(branch, context)
    );
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
        default: enumValues.includes(false) ? false : enumValues[0],
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
      output[name] = {
        name,
        type,
        ...(type.kind === 'integer'
          ? { default: 0 }
          : type.kind === 'boolean'
            ? { default: false }
            : implicitDefaultForType(type)),
      };
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
