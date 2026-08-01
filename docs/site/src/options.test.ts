import { describe, expect, test } from 'vitest';
import {
  categoryFromSectionHash,
  filterAndGroupOptions,
  matchesOptionQuery,
  parseOptionSearchState,
  resolveOptionHashTarget,
  serializeOptionSearchState,
} from './options';
import type { OptionCategory, OptionEntry } from './types';

function option(
  name: string,
  category: OptionCategory,
  description: string,
  type: string
): OptionEntry {
  return {
    category,
    description,
    name,
    searchText: `${name} ${type} ${description}`.toLowerCase(),
    type,
  };
}

const options = [
  option('programs.nixcord.enable', 'core', 'Whether to enable Nixcord.', 'boolean'),
  option('programs.nixcord.quickCss', 'core', 'CSS injected into the client.', 'string'),
  option(
    'programs.nixcord.config.plugins.alpha.enable',
    'shared',
    'Whether to enable Alpha.',
    'boolean'
  ),
  option(
    'programs.nixcord.config.plugins.alpha.message',
    'shared',
    'Message shown by the plugin.',
    'string'
  ),
  option(
    'programs.nixcord.config.plugins.questify.enable',
    'equicord',
    'Whether to enable Questify.',
    'boolean'
  ),
];

describe('option reference search', () => {
  test('matches option names, descriptions, and types case-insensitively', () => {
    expect(matchesOptionQuery(options[3]!, 'ALPHA.MESSAGE')).toBe(true);
    expect(matchesOptionQuery(options[1]!, ' injected   into ')).toBe(true);
    expect(matchesOptionQuery(options[0]!, 'BOOLEAN')).toBe(true);
    expect(matchesOptionQuery(options[0]!, 'questify')).toBe(false);
  });

  test('keeps matching and total counts at category and plugin levels', () => {
    const sections = filterAndGroupOptions(options, { category: 'all', query: 'boolean' });
    const shared = sections.find((section) => section.category === 'shared');
    const sharedPlugin = shared?.items.find((item) => item.kind === 'plugin');

    expect(shared).toMatchObject({ optionCount: 1, totalOptionCount: 2 });
    expect(sharedPlugin).toMatchObject({
      group: { optionCount: 1, totalOptionCount: 2 },
      kind: 'plugin',
    });
  });

  test('limits the hierarchy to a selected category without truncating its matches', () => {
    const sections = filterAndGroupOptions(options, { category: 'shared', query: 'alpha' });

    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({
      category: 'shared',
      optionCount: 2,
      totalOptionCount: 2,
    });
  });
});

describe('option reference URLs', () => {
  test('parses supported state and ignores invalid categories', () => {
    expect(parseOptionSearchState('?q=%20Alpha%20&category=shared')).toEqual({
      category: 'shared',
      query: 'Alpha',
    });
    expect(parseOptionSearchState('?q=test&category=unknown')).toEqual({
      category: 'all',
      query: 'test',
    });
  });

  test('serializes shareable state while preserving unrelated parameters', () => {
    expect(
      serializeOptionSearchState('?ref=readme&category=core', {
        category: 'equicord',
        query: '  Questify  ',
      })
    ).toBe('?ref=readme&category=equicord&q=Questify');

    expect(
      serializeOptionSearchState('?q=old&category=shared', { category: 'all', query: '' })
    ).toBe('');
  });

  test('resolves option, plugin, and category hashes', () => {
    expect(
      resolveOptionHashTarget(options, '#opt-programs.nixcord.config.plugins.alpha.message')
    ).toEqual({
      category: 'shared',
      optionName: 'programs.nixcord.config.plugins.alpha.message',
      pluginName: 'programs.nixcord.config.plugins.alpha',
    });
    expect(
      resolveOptionHashTarget(options, '#opt-programs.nixcord.config.plugins.alpha')
    ).toEqual({
      category: 'shared',
      pluginName: 'programs.nixcord.config.plugins.alpha',
    });
    expect(resolveOptionHashTarget(options, '#opt-missing')).toBeNull();
    expect(categoryFromSectionHash('#options-equicord')).toBe('equicord');
    expect(categoryFromSectionHash('#sec-options')).toBeNull();
  });
});
