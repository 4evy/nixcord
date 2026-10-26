import type { SettingListElement, SettingScalar, SettingType, SettingValue } from '@nixcord/domain';
import { Array as Arr } from 'effect';
import type { OptionTypeName } from '../profiles.js';
import { contextualTypeNode, type TypeContext, typeMembers } from './type-context.js';

export interface SelectOption {
  readonly value: SettingScalar;
  readonly label?: string;
  readonly isDefault: boolean;
}

// A declared but unresolved default must never receive an invented fallback
export type DefaultEvidence =
  | { readonly kind: 'absent' }
  | { readonly kind: 'unresolved' }
  | { readonly kind: 'known'; readonly value: SettingValue };

export interface SettingRuleInput {
  readonly optionType?: OptionTypeName;
  readonly defaultEvidence: DefaultEvidence;
  readonly options: readonly SelectOption[];
  readonly contextualType?: string | TypeContext;
}

export interface SettingRuleResult {
  readonly type: SettingType;
  readonly defaultValue?: SettingValue;
}

const withDefault = (
  type: SettingType,
  input: SettingRuleInput,
  fallback?: SettingValue
): SettingRuleResult => {
  const evidence = input.defaultEvidence;
  if (evidence.kind === 'known') return { type, defaultValue: evidence.value };
  if (evidence.kind === 'absent' && fallback !== undefined) return { type, defaultValue: fallback };
  return { type };
};

const selectRule = (input: SettingRuleInput): SettingRuleResult => {
  const options = Arr.dedupeWith(input.options, (left, right) => left.value === right.value);
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
  contextualType?: string | TypeContext
): SettingType => {
  if (typeof value === 'boolean') return { kind: 'boolean' };
  if (typeof value === 'number')
    return Number.isInteger(value) ? { kind: 'integer' } : { kind: 'float' };
  const context = contextualTypeNode(contextualType);
  const members = typeMembers(context);
  const nullable = members.some(isNullType);
  if (typeof value === 'string') return { kind: 'string', nullable };
  const isRecord = members.some((member) => member.name === 'record');
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
  if (value && typeof value === 'object') return { kind: 'attrs', nullable };
  const contextualListElement = listElementFromContext(context);
  if (contextualListElement) return { kind: 'list', element: contextualListElement };
  if (isRecord) return { kind: 'attrs', nullable: true };
  if (members.some((member) => member.name === 'boolean')) return { kind: 'boolean' };
  if (members.some((member) => member.name === 'number')) return { kind: 'float' };
  return { kind: 'string', nullable: true };
};

const isNullType = (context: TypeContext): boolean => context.name === 'null';

const listElementFromContext = (
  context: TypeContext | undefined
): SettingListElement | undefined => {
  const element = context?.element;
  if (!element) return undefined;
  const members = typeMembers(element).filter((member) => member.name !== 'never');
  if (members.length === 0) return 'anything';
  if (members.every((member) => member.name === 'string')) return 'string';
  if (members.every((member) => member.name === 'number')) return 'number';
  if (members.every((member) => member.name === 'boolean')) return 'boolean';
  if (
    members.length > 1 ||
    members.some((member) => ['any', 'unknown'].includes(member.name ?? ''))
  )
    return 'anything';
  return 'attrs';
};

const inferInputType = (input: SettingRuleInput): SettingType =>
  inferTypeFromValue(
    input.defaultEvidence.kind === 'known' ? input.defaultEvidence.value : undefined,
    input.contextualType
  );

const RULES: Readonly<Record<OptionTypeName, (input: SettingRuleInput) => SettingRuleResult>> = {
  BOOLEAN: (input) => withDefault({ kind: 'boolean' }, input, false),
  STRING: (input) =>
    withDefault(
      {
        kind: 'string',
        nullable:
          input.defaultEvidence.kind === 'absent' ||
          (input.defaultEvidence.kind === 'known' && input.defaultEvidence.value === null) ||
          typeMembers(contextualTypeNode(input.contextualType)).some(isNullType),
      },
      input,
      null
    ),
  NUMBER: (input) =>
    withDefault(
      input.defaultEvidence.kind === 'known' &&
        typeof input.defaultEvidence.value === 'number' &&
        Number.isInteger(input.defaultEvidence.value)
        ? { kind: 'integer' }
        : { kind: 'float' },
      input
    ),
  BIGINT: (input) => withDefault({ kind: 'integer' }, input),
  SELECT: selectRule,
  SLIDER: (input) => withDefault({ kind: 'float' }, input),
  COMPONENT: (input) => withDefault(inferInputType(input), input),
  CUSTOM: (input) =>
    input.options.length > 0 ? selectRule(input) : withDefault(inferInputType(input), input),
};

export function applySettingRule(input: SettingRuleInput): SettingRuleResult {
  if (input.optionType) return RULES[input.optionType](input);
  return withDefault(inferInputType(input), input);
}
