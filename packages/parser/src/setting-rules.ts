import type { SettingListElement, SettingScalar, SettingType, SettingValue } from '@nixcord/shared';
import { ts } from 'ts-morph';
import type { OptionTypeName } from './source-profiles.js';

export interface SelectOption {
  readonly value: SettingScalar;
  readonly label?: string;
  readonly isDefault: boolean;
}

export interface SettingRuleInput {
  readonly optionType?: OptionTypeName;
  readonly hasDefault: boolean;
  readonly hasDeclaredDefault?: boolean;
  readonly defaultValue?: SettingValue;
  readonly options: readonly SelectOption[];
  readonly contextualType?: string;
}

export interface SettingRuleResult {
  readonly type: SettingType;
  readonly hasDefault: boolean;
  readonly defaultValue?: SettingValue;
}

const withDefault = (
  type: SettingType,
  input: SettingRuleInput,
  fallback?: SettingValue
): SettingRuleResult => ({
  type,
  hasDefault: input.hasDefault || (input.hasDeclaredDefault !== true && fallback !== undefined),
  ...(input.hasDefault
    ? { defaultValue: input.defaultValue }
    : input.hasDeclaredDefault !== true && fallback !== undefined
      ? { defaultValue: fallback }
      : {}),
});

const selectRule = (input: SettingRuleInput): SettingRuleResult => {
  const seen = new Set<SettingScalar>();
  const options = input.options.filter((option) => {
    if (seen.has(option.value)) return false;
    seen.add(option.value);
    return true;
  });
  const values = options.map((option) => option.value);
  if (
    values.length === 2 &&
    values.includes(true) &&
    values.includes(false) &&
    values.every((value) => typeof value === 'boolean')
  ) {
    const selected = options.find((option) => option.isDefault)?.value;
    return withDefault({ kind: 'boolean' }, input, selected ?? false);
  }
  if (values.length === 0) return withDefault({ kind: 'string', nullable: true }, input, null);
  const labels = Object.fromEntries(
    options.flatMap((option) =>
      option.label === undefined ? [] : [[String(option.value), option.label]]
    )
  );
  const selected = options.find((option) => option.isDefault)?.value ?? values[0];
  return withDefault(
    {
      kind: 'enum',
      values,
      ...(Object.keys(labels).length ? { labels } : {}),
    },
    input,
    selected
  );
};

export const inferTypeFromValue = (
  value: SettingValue | undefined,
  contextualType?: string | ts.TypeNode
): SettingType => {
  if (typeof value === 'boolean') return { kind: 'boolean' };
  if (typeof value === 'number')
    return Number.isInteger(value) ? { kind: 'integer' } : { kind: 'float' };
  if (typeof value === 'string') return { kind: 'string', nullable: false };
  const context =
    typeof contextualType === 'string'
      ? contextualTypeNode(contextualType)
      : contextualType
        ? unwrapType(contextualType)
        : undefined;
  const members = context && ts.isUnionTypeNode(context) ? context.types : context ? [context] : [];
  const isRecord = members.some(
    (member) =>
      ts.isTypeLiteralNode(member) ||
      (ts.isTypeReferenceNode(member) &&
        ts.isIdentifier(member.typeName) &&
        member.typeName.text === 'Record')
  );
  if (value === null) {
    return isRecord ? { kind: 'attrs', nullable: true } : { kind: 'string', nullable: true };
  }
  if (Array.isArray(value)) {
    const contextualElement = listElementFromContext(context);
    if (value.length === 0) return { kind: 'list', element: contextualElement ?? 'anything' };
    if (value.every((item) => typeof item === 'string')) return { kind: 'list', element: 'string' };
    if (value.every((item) => typeof item === 'number')) return { kind: 'list', element: 'number' };
    if (value.every((item) => typeof item === 'boolean'))
      return { kind: 'list', element: 'boolean' };
    if (value.every((item) => item !== null && typeof item === 'object' && !Array.isArray(item)))
      return { kind: 'list', element: 'attrs' };
    return { kind: 'list', element: 'anything' };
  }
  if (value && typeof value === 'object') return { kind: 'attrs', nullable: false };
  const contextualListElement = listElementFromContext(context);
  if (contextualListElement) return { kind: 'list', element: contextualListElement };
  if (isRecord) return { kind: 'attrs', nullable: true };
  if (members.some((member) => member.kind === ts.SyntaxKind.BooleanKeyword))
    return { kind: 'boolean' };
  if (members.some((member) => member.kind === ts.SyntaxKind.NumberKeyword))
    return { kind: 'float' };
  return { kind: 'string', nullable: true };
};

const unwrapType = (node: ts.TypeNode): ts.TypeNode => {
  while (ts.isParenthesizedTypeNode(node) || ts.isTypeOperatorNode(node)) node = node.type;
  return node;
};

const contextualTypeNode = (text: string | undefined): ts.TypeNode | undefined => {
  if (!text) return undefined;
  const source = ts.createSourceFile(
    'context.ts',
    `type Setting = ${text};`,
    ts.ScriptTarget.Latest
  );
  const declaration = source.statements[0];
  return declaration && ts.isTypeAliasDeclaration(declaration)
    ? unwrapType(declaration.type)
    : undefined;
};

const listElementFromContext = (type: ts.TypeNode | undefined): SettingListElement | undefined => {
  if (!type) return undefined;
  const element = ts.isArrayTypeNode(type)
    ? type.elementType
    : ts.isTypeReferenceNode(type) &&
        ts.isIdentifier(type.typeName) &&
        ['Array', 'ReadonlyArray'].includes(type.typeName.text)
      ? type.typeArguments?.[0]
      : undefined;
  if (!element) return undefined;
  const unwrapped = unwrapType(element);
  const members = ts.isUnionTypeNode(unwrapped)
    ? unwrapped.types.filter((member) => member.kind !== ts.SyntaxKind.NeverKeyword)
    : [unwrapped];
  if (members.length === 0) return 'anything';
  if (members.every((member) => member.kind === ts.SyntaxKind.StringKeyword)) return 'string';
  if (members.every((member) => member.kind === ts.SyntaxKind.NumberKeyword)) return 'number';
  if (members.every((member) => member.kind === ts.SyntaxKind.BooleanKeyword)) return 'boolean';
  if (
    members.length > 1 ||
    members.some((member) =>
      [ts.SyntaxKind.AnyKeyword, ts.SyntaxKind.UnknownKeyword, ts.SyntaxKind.NeverKeyword].includes(
        member.kind
      )
    )
  )
    return 'anything';
  return 'attrs';
};

const RULES: Readonly<Record<OptionTypeName, (input: SettingRuleInput) => SettingRuleResult>> = {
  BOOLEAN: (input) => withDefault({ kind: 'boolean' }, input, false),
  STRING: (input) =>
    withDefault(
      {
        kind: 'string',
        nullable: input.hasDeclaredDefault !== true || input.defaultValue === null,
      },
      input,
      null
    ),
  NUMBER: (input) =>
    withDefault(
      input.hasDefault &&
        typeof input.defaultValue === 'number' &&
        Number.isInteger(input.defaultValue)
        ? { kind: 'integer' }
        : { kind: 'float' },
      input
    ),
  BIGINT: (input) => withDefault({ kind: 'integer' }, input),
  SELECT: selectRule,
  SLIDER: (input) => withDefault({ kind: 'float' }, input),
  COMPONENT: (input) =>
    withDefault(inferTypeFromValue(input.defaultValue, input.contextualType), input),
  CUSTOM: (input) =>
    input.options.length > 0
      ? selectRule(input)
      : withDefault(inferTypeFromValue(input.defaultValue, input.contextualType), input),
};

export function applySettingRule(input: SettingRuleInput): SettingRuleResult {
  if (input.optionType) return RULES[input.optionType](input);
  return withDefault(inferTypeFromValue(input.defaultValue, input.contextualType), input);
}
