import { describe, expect, test } from 'vitest';
import { applySettingRule } from '../../src/setting-rules.js';

describe('declarative setting rules', () => {
  test.each([
    ['BOOLEAN', false, undefined, { kind: 'boolean' }, false],
    ['STRING', false, undefined, { kind: 'string', nullable: true }, null],
    ['NUMBER', true, 2, { kind: 'integer' }, 2],
    ['NUMBER', true, 2.5, { kind: 'float' }, 2.5],
    ['SLIDER', true, 1, { kind: 'float' }, 1],
    ['BIGINT', true, '1234567890123456789', { kind: 'integer' }, '1234567890123456789'],
  ] as const)(
    '%s normalizes to a semantic type',
    (optionType, hasDefault, value, type, fallback) => {
      expect(
        applySettingRule({
          optionType,
          hasDefault,
          ...(hasDefault ? { defaultValue: value } : {}),
          options: [],
        })
      ).toMatchObject({ type, defaultValue: fallback });
    }
  );

  test('boolean selects collapse while other selects retain values and labels', () => {
    expect(
      applySettingRule({
        optionType: 'SELECT',
        hasDefault: false,
        options: [
          { value: true, label: 'On', isDefault: true },
          { value: false, label: 'Off', isDefault: false },
        ],
      })
    ).toMatchObject({ type: { kind: 'boolean' }, defaultValue: true });

    expect(
      applySettingRule({
        optionType: 'SELECT',
        hasDefault: false,
        options: [
          { value: 'one', label: 'One', isDefault: false },
          { value: 'two', label: 'Two', isDefault: true },
        ],
      })
    ).toMatchObject({
      type: { kind: 'enum', values: ['one', 'two'], labels: { one: 'One', two: 'Two' } },
      defaultValue: 'two',
    });
  });

  test('deduplicates repeated select values while preserving their first label', () => {
    expect(
      applySettingRule({
        optionType: 'SELECT',
        hasDefault: false,
        options: [
          { value: 'high', label: 'High', isDefault: true },
          { value: 'low', label: 'Low', isDefault: false },
          { value: 'low', label: 'Lowest', isDefault: false },
        ],
      })
    ).toMatchObject({
      type: { kind: 'enum', values: ['high', 'low'], labels: { high: 'High', low: 'Low' } },
      defaultValue: 'high',
    });
  });

  test('empty arrays use contextual string-list evidence', () => {
    expect(
      applySettingRule({
        hasDefault: true,
        defaultValue: [],
        options: [],
        contextualType: 'string[]',
      })
    ).toMatchObject({ type: { kind: 'list', element: 'string' }, defaultValue: [] });
  });

  test('empty arrays preserve contextual element types and otherwise accept anything', () => {
    expect(
      applySettingRule({
        hasDefault: true,
        defaultValue: [],
        options: [],
        contextualType: 'Array<KeywordEntry>',
      })
    ).toMatchObject({ type: { kind: 'list', element: 'attrs' }, defaultValue: [] });

    expect(
      applySettingRule({
        hasDefault: true,
        defaultValue: [],
        options: [],
      })
    ).toMatchObject({ type: { kind: 'list', element: 'anything' }, defaultValue: [] });
  });
});
