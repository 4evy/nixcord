import type { SettingListElement, SettingScalar, SettingType, SettingValue } from '@nixcord/shared';
import type { OptionTypeName } from './source-profiles.js';

export interface SelectOption {
  readonly value: SettingScalar;
  readonly label?: string;
  readonly isDefault: boolean;
}

export interface SettingRuleInput {
  readonly optionType?: OptionTypeName;
  readonly hasDefault: boolean;
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
  hasDefault: input.hasDefault || fallback !== undefined,
  ...(input.hasDefault
    ? { defaultValue: input.defaultValue }
    : fallback !== undefined
      ? { defaultValue: fallback }
      : {}),
});

const selectRule = (input: SettingRuleInput): SettingRuleResult => {
  const values = input.options.map((option) => option.value);
  if (
    values.length === 2 &&
    values.includes(true) &&
    values.includes(false) &&
    values.every((value) => typeof value === 'boolean')
  ) {
    const selected = input.options.find((option) => option.isDefault)?.value;
    return withDefault({ kind: 'boolean' }, input, selected ?? false);
  }
  if (values.length === 0) return withDefault({ kind: 'string', nullable: true }, input, null);
  const labels = Object.fromEntries(
    input.options.flatMap((option) =>
      option.label === undefined ? [] : [[String(option.value), option.label]]
    )
  );
  const selected = input.options.find((option) => option.isDefault)?.value ?? values[0];
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
  contextualType?: string
): SettingType => {
  if (typeof value === 'boolean') return { kind: 'boolean' };
  if (typeof value === 'number')
    return Number.isInteger(value) ? { kind: 'integer' } : { kind: 'float' };
  if (typeof value === 'string') return { kind: 'string', nullable: false };
  if (value === null) {
    return contextualType?.includes('Record') || contextualType?.includes('{')
      ? { kind: 'attrs', nullable: true }
      : { kind: 'string', nullable: true };
  }
  if (Array.isArray(value)) {
    const contextualElement = listElementFromContext(contextualType);
    if (contextualElement) return { kind: 'list', element: contextualElement };
    if (value.length === 0) return { kind: 'list', element: 'anything' };
    if (value.every((item) => typeof item === 'string')) return { kind: 'list', element: 'string' };
    if (value.every((item) => typeof item === 'number')) return { kind: 'list', element: 'number' };
    if (value.every((item) => typeof item === 'boolean'))
      return { kind: 'list', element: 'boolean' };
    if (value.every((item) => item !== null && typeof item === 'object' && !Array.isArray(item)))
      return { kind: 'list', element: 'attrs' };
    return { kind: 'list', element: 'anything' };
  }
  if (value && typeof value === 'object') return { kind: 'attrs', nullable: false };
  const contextualListElement = listElementFromContext(contextualType);
  if (contextualListElement) return { kind: 'list', element: contextualListElement };
  if (/(?:Record\s*<|\{)/.test(contextualType ?? '')) return { kind: 'attrs', nullable: true };
  if ((contextualType ?? '').includes('boolean')) return { kind: 'boolean' };
  if ((contextualType ?? '').includes('number')) return { kind: 'float' };
  return { kind: 'string', nullable: true };
};

const listElementFromContext = (
  contextualType: string | undefined
): SettingListElement | undefined => {
  if (!contextualType) return undefined;
  const type = contextualType.replace(/\s+/g, ' ').trim();
  const arrayElement =
    type.match(/^(?:readonly )?(.+?)\[\]$/)?.[1] ??
    type.match(/^(?:Readonly)?Array\s*<\s*(.+)\s*>$/)?.[1];
  if (!arrayElement) return undefined;
  const element = arrayElement
    .trim()
    .replace(/^\((.*)\)$/, '$1')
    .trim();
  if (element === 'string' || /^(?:string\s*\|\s*)+never$/.test(element)) return 'string';
  if (element === 'number') return 'number';
  if (element === 'boolean') return 'boolean';
  if (element === 'any' || element === 'unknown' || element === 'never') return 'anything';
  if (element.includes('|') && !/^\{.*\}$/.test(element)) return 'anything';
  return 'attrs';
};

const RULES: Readonly<Record<OptionTypeName, (input: SettingRuleInput) => SettingRuleResult>> = {
  BOOLEAN: (input) => withDefault({ kind: 'boolean' }, input, false),
  STRING: (input) =>
    withDefault(
      { kind: 'string', nullable: !input.hasDefault || input.defaultValue === null },
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
