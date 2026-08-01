import type {
  OptionCategory,
  OptionEntry,
  OptionHashTarget,
  OptionReferenceSearchState,
  OptionSection,
  OptionSectionItem,
  PluginOptionGroup,
  RawOption,
} from './types';

const emptyText = 'Not specified';
const pluginOptionPrefix = 'programs.nixcord.config.plugins.';

const optionCategoryOrder: OptionCategory[] = ['core', 'shared', 'vencord', 'equicord'];

const optionCategoryMetadata: Record<
  OptionCategory,
  Pick<OptionSection, 'description' | 'id' | 'title'>
> = {
  core: {
    description: 'Module, client, package, theme, and extra configuration options.',
    id: 'options-core',
    title: 'Core Nixcord Options',
  },
  shared: {
    description: 'Plugin options available for both Vencord and Equicord clients.',
    id: 'options-shared',
    title: 'Shared Plugin Options',
  },
  vencord: {
    description: 'Plugin options that only exist in Vencord.',
    id: 'options-vencord',
    title: 'Vencord-only Plugin Options',
  },
  equicord: {
    description: 'Plugin options that only exist in Equicord.',
    id: 'options-equicord',
    title: 'Equicord-only Plugin Options',
  },
};

export function stringifyDocValue(value: unknown): string {
  if (value == null) return emptyText;
  if (typeof value === 'string') return normalizeWhitespace(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (typeof value === 'object') {
    const maybeLiteral = value as { text?: unknown };
    if (typeof maybeLiteral.text === 'string') {
      return normalizeWhitespace(maybeLiteral.text);
    }
  }

  return normalizeWhitespace(JSON.stringify(value, null, 2));
}

function prepareOptions(raw: Record<string, RawOption>): OptionEntry[] {
  return Object.entries(raw)
    .map(([name, option]) => {
      const description = stringifyDocValue(option.description);
      const type = option.type ?? '';

      return {
        ...option,
        category: getOptionCategory(option),
        name,
        searchText: `${name} ${type} ${description}`.toLowerCase(),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function filterAndGroupOptions(
  options: OptionEntry[],
  state: OptionReferenceSearchState
): OptionSection[] {
  const normalizedQuery = normalizeSearchQuery(state.query);

  return optionCategoryOrder
    .filter((category) => state.category === 'all' || category === state.category)
    .map((category) => {
      const section = optionCategoryMetadata[category];
      const categoryOptions = options.filter((option) => option.category === category);
      const matchingOptions = categoryOptions.filter((option) =>
        matchesOptionQuery(option, normalizedQuery)
      );

      return {
        ...section,
        category,
        items: groupSectionOptions(matchingOptions, categoryOptions),
        optionCount: matchingOptions.length,
        totalOptionCount: categoryOptions.length,
      };
    });
}

export function matchesOptionQuery(option: OptionEntry, query: string): boolean {
  const normalizedQuery = normalizeSearchQuery(query);
  return normalizedQuery === '' || option.searchText.includes(normalizedQuery);
}

export function parseOptionSearchState(search: string): OptionReferenceSearchState {
  const params = new URLSearchParams(search);
  const category = params.get('category');

  return {
    category: isOptionCategory(category) ? category : 'all',
    query: normalizeWhitespace(params.get('q') ?? ''),
  };
}

export function serializeOptionSearchState(
  search: string,
  state: OptionReferenceSearchState
): string {
  const params = new URLSearchParams(search);
  const query = normalizeWhitespace(state.query);

  if (query) params.set('q', query);
  else params.delete('q');

  if (state.category === 'all') params.delete('category');
  else params.set('category', state.category);

  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

export function resolveOptionHashTarget(
  options: OptionEntry[],
  hash: string
): OptionHashTarget | null {
  if (!hash.startsWith('#opt-')) return null;

  const targetName = decodeURIComponent(hash.slice('#opt-'.length));
  const exactOption = options.find((option) => option.name === targetName);

  if (exactOption) {
    return {
      category: exactOption.category,
      optionName: exactOption.name,
      pluginName: getPluginRoot(exactOption.name) ?? undefined,
    };
  }

  const pluginOption = options.find((option) => getPluginRoot(option.name) === targetName);
  if (!pluginOption) return null;

  return {
    category: pluginOption.category,
    pluginName: targetName,
  };
}

export function categoryFromSectionHash(hash: string): OptionCategory | null {
  const sectionId = hash.startsWith('#') ? hash.slice(1) : hash;
  const category = optionCategoryOrder.find(
    (candidate) => optionCategoryMetadata[candidate].id === sectionId
  );
  return category ?? null;
}

export async function loadOptions(): Promise<OptionEntry[]> {
  const response = await fetch(`${import.meta.env.BASE_URL}options.json`);

  if (!response.ok) {
    throw new Error(`Could not load options.json (${response.status})`);
  }

  const raw = (await response.json()) as Record<string, RawOption>;
  return prepareOptions(raw);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function getOptionCategory(option: RawOption): OptionCategory {
  const declarationText = option.declarations
    ?.map((declaration) => `${declaration.name ?? ''} ${declaration.url ?? ''}`)
    .join(' ');

  if (declarationText?.includes('modules/plugins/shared.json')) return 'shared';
  if (declarationText?.includes('modules/plugins/vencord.json')) return 'vencord';
  if (declarationText?.includes('modules/plugins/equicord.json')) return 'equicord';

  return 'core';
}

function groupSectionOptions(
  options: OptionEntry[],
  totalOptions: OptionEntry[]
): OptionSectionItem[] {
  const pluginGroups = new Map<string, OptionEntry[]>();
  const totalPluginGroupSizes = new Map<string, number>();
  const coreOptions: OptionSectionItem[] = [];

  for (const option of totalOptions) {
    const pluginRoot = getPluginRoot(option.name);
    if (pluginRoot == null) continue;
    totalPluginGroupSizes.set(pluginRoot, (totalPluginGroupSizes.get(pluginRoot) ?? 0) + 1);
  }

  for (const option of options) {
    const pluginRoot = getPluginRoot(option.name);

    if (pluginRoot == null) {
      coreOptions.push({ kind: 'option', option });
      continue;
    }

    const groupOptions = pluginGroups.get(pluginRoot) ?? [];
    groupOptions.push(option);
    pluginGroups.set(pluginRoot, groupOptions);
  }

  const groupedPlugins: OptionSectionItem[] = Array.from(pluginGroups, ([name, groupOptions]) => {
    const sortedOptions = [...groupOptions].sort((left, right) => comparePluginOptions(name, left, right));

    return {
      group: {
        category: sortedOptions[0]?.category ?? 'core',
        name,
        optionCount: sortedOptions.length,
        options: sortedOptions,
        totalOptionCount: totalPluginGroupSizes.get(name) ?? sortedOptions.length,
      } satisfies PluginOptionGroup,
      kind: 'plugin',
    };
  });

  return [...coreOptions, ...groupedPlugins].sort((left, right) => getSectionItemName(left).localeCompare(getSectionItemName(right)));
}

export function getPluginOptionLabel(pluginName: string, optionName: string): string {
  return optionName.startsWith(`${pluginName}.`) ? optionName.slice(pluginName.length + 1) : optionName;
}

export function getPluginRoot(optionName: string): string | null {
  if (!optionName.startsWith(pluginOptionPrefix)) return null;

  const parts = optionName.split('.');
  if (parts.length < 6) return null;

  return parts.slice(0, 5).join('.');
}

function getSectionItemName(item: OptionSectionItem): string {
  return item.kind === 'plugin' ? item.group.name : item.option.name;
}

function comparePluginOptions(pluginName: string, left: OptionEntry, right: OptionEntry): number {
  const leftLabel = getPluginOptionLabel(pluginName, left.name);
  const rightLabel = getPluginOptionLabel(pluginName, right.name);
  const leftRank = getPluginOptionRank(leftLabel);
  const rightRank = getPluginOptionRank(rightLabel);

  if (leftRank !== rightRank) return leftRank - rightRank;
  return leftLabel.localeCompare(rightLabel);
}

function getPluginOptionRank(label: string): number {
  return label === 'enable' || label === 'enabled' ? 0 : 1;
}

function normalizeSearchQuery(value: string): string {
  return normalizeWhitespace(value).toLowerCase();
}

function isOptionCategory(value: string | null): value is OptionCategory {
  return value != null && optionCategoryOrder.includes(value as OptionCategory);
}
