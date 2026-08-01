export type OptionDeclaration = {
  name?: string;
  url?: string;
};

export type RawOption = {
  declarations?: OptionDeclaration[];
  default?: unknown;
  description?: unknown;
  example?: unknown;
  loc?: string[];
  readOnly?: boolean;
  type?: string;
};

export type OptionEntry = RawOption & {
  category: OptionCategory;
  name: string;
  searchText: string;
};

export type OptionCategory = 'core' | 'shared' | 'vencord' | 'equicord';

export type OptionCategoryFilter = OptionCategory | 'all';

export type OptionReferenceSearchState = {
  category: OptionCategoryFilter;
  query: string;
};

export type OptionHashTarget = {
  category: OptionCategory;
  optionName?: string;
  pluginName?: string;
};

export type PluginOptionGroup = {
  category: OptionCategory;
  name: string;
  optionCount: number;
  options: OptionEntry[];
  totalOptionCount: number;
};

export type OptionSectionItem =
  | {
      kind: 'option';
      option: OptionEntry;
    }
  | {
      group: PluginOptionGroup;
      kind: 'plugin';
    };

export type OptionSection = {
  category: OptionCategory;
  description: string;
  id: string;
  items: OptionSectionItem[];
  optionCount: number;
  title: string;
  totalOptionCount: number;
};
