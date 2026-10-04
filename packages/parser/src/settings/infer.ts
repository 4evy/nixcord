import {
  resolvedDeclaration,
  type StaticEvaluator,
  type StaticValue,
  unwrapExpression,
} from '@nixcord/ast';
import type { PluginConfig, PluginSetting, SettingScalar, SettingType } from '@nixcord/shared';
import {
  type CallExpression,
  Node,
  type ObjectLiteralExpression,
  SyntaxKind,
  type Type,
  type TypeChecker,
  TypeFormatFlags,
  type TypeLiteralNode,
} from 'ts-morph';
import type { PluginContext } from '../context.js';
import type { OptionTypeName, SourceProfile } from '../profiles.js';
import { importIdentity, objectPropertyInitializer, resolveNode } from '../resolve.js';
import { isRecord, propertyKey } from './extract.js';
import { inferTypeFromValue, type SelectOption } from './rules.js';

// Infer option values and private schemas without executing components
const contextualTypeText = (type: Type, node: Node): string => {
  const flags = TypeFormatFlags.NoTruncation | TypeFormatFlags.InTypeAlias;
  const element =
    type.getArrayElementType() ??
    (type.isReadonlyArray() || type.isTuple() ? type.getNumberIndexType() : undefined);
  if (element) return `(${element.getBaseTypeOfLiteralType().getText(node, flags)})[]`;
  return type.getText(node, flags);
};

export const explicitTypeText = (
  node: Node | undefined,
  checker: TypeChecker,
  visited = new Set<Node>()
): string | undefined => {
  if (!node || visited.has(node)) return undefined;
  visited.add(node);
  try {
    const type = checker.getTypeAtLocation(node);
    if (!type.isAny()) return contextualTypeText(type, node);

    // Unresolved upstream types still carry useful source annotations
    const unwrapped = node.isKind(SyntaxKind.ParenthesizedExpression) ? node.getExpression() : node;
    const assertedType =
      unwrapped.asKind(SyntaxKind.AsExpression)?.getTypeNode() ??
      unwrapped.asKind(SyntaxKind.TypeAssertionExpression)?.getTypeNode() ??
      unwrapped.asKind(SyntaxKind.SatisfiesExpression)?.getTypeNode();
    if (assertedType) return assertedType.getText();
    const declaration = resolvedDeclaration(unwrapped, checker);
    if (declaration?.isKind(SyntaxKind.VariableDeclaration))
      return (
        declaration.getTypeNode()?.getText() ??
        explicitTypeText(declaration.getInitializer(), checker, visited)
      );
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
  const value = type.isBooleanLiteral() ? type.getText() === 'true' : type.getLiteralValue();
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? value
    : undefined;
};

export const enumValuesFromType = (
  typeNode: Node,
  checker: TypeChecker,
  profile: SourceProfile
): readonly SettingScalar[] | undefined => {
  const explicitTypeNode =
    typeNode.asKind(SyntaxKind.AsExpression)?.getTypeNode() ??
    typeNode.asKind(SyntaxKind.TypeAssertionExpression)?.getTypeNode() ??
    typeNode.asKind(SyntaxKind.SatisfiesExpression)?.getTypeNode() ??
    unwrapExpression(typeNode);
  const type = checker.getTypeAtLocation(typeNode);
  const members = type.isUnion() ? type.getUnionTypes() : [type];
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
    const alias = type.getAliasSymbol()?.getDeclarations().find(Node.isTypeAliasDeclaration);
    const sourceUnion =
      explicitTypeNode.asKind(SyntaxKind.UnionType) ??
      alias?.getTypeNode()?.asKind(SyntaxKind.UnionType);
    if (!sourceUnion) return values;

    // Union source order controls presentation and the first implicit default
    const remaining = new Set(values);
    const ordered: SettingScalar[] = [];
    for (const sourceMember of sourceUnion.getTypeNodes()) {
      const memberType = checker.getTypeAtLocation(sourceMember);
      for (const member of memberType.isUnion() ? memberType.getUnionTypes() : [memberType]) {
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

const privateSettingsFromTypeLiteral = (
  literal: TypeLiteralNode,
  context: PluginContext
): Record<string, PluginSetting | PluginConfig> => {
  const output: Record<string, PluginSetting | PluginConfig> = {};
  for (const member of literal.getMembers()) {
    const property = member.asKind(SyntaxKind.PropertySignature);
    if (!property) continue;
    const name = propertyKey(property.getNameNode(), context.evaluator);
    if (name === undefined) continue;
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
    } else {
      const checkedType = context.session.checker.getTypeAtLocation(typeNode);
      const inferred = inferTypeFromValue(
        undefined,
        explicitTypeText(typeNode, context.session.checker) ?? typeNode.compilerNode
      );
      const type: SettingType = checkedType.isBoolean()
        ? { kind: 'boolean' }
        : checkedType.isNumber() || inferred.kind === 'float'
          ? { kind: 'integer' }
          : inferred.kind === 'attrs'
            ? { kind: 'attrs', nullable: false }
            : inferred.kind !== 'list' && (checkedType.isArray() || checkedType.isTuple())
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
  return output;
};

export const privateSettings = (
  settingsCall: CallExpression,
  context: PluginContext
): Record<string, PluginSetting | PluginConfig> => {
  const property = settingsCall.getParentIfKind(SyntaxKind.PropertyAccessExpression);
  const chained = property?.getParentIfKind(SyntaxKind.CallExpression);
  if (property?.getName() !== 'withPrivateSettings') return {};
  const literal = chained?.getTypeArguments()[0]?.asKind(SyntaxKind.TypeLiteral);
  return literal ? privateSettingsFromTypeLiteral(literal, context) : {};
};
