import type { SettingScalar } from '@nixcord/shared';

export type SourceKind = 'vencord' | 'equicord';

export interface SourceProfile {
  readonly entryGlobs: readonly string[];
  readonly clientSpecificPlugins: readonly string[];
  readonly apiModules: readonly string[];
  readonly apiDeclarations: Readonly<Record<string, readonly string[]>>;
  readonly optionTypes: Readonly<Record<number, OptionTypeName>>;
  readonly supportGlobs: readonly string[];
  readonly controlComponents: Readonly<Record<string, 'boolean' | 'string' | 'number' | 'enum'>>;
  readonly structuredComponentDescriptions: {
    readonly parentSuffix: string;
    readonly childTemplates: Readonly<Record<string, string>>;
  };
  readonly enumFallbacks: Readonly<Record<string, readonly SettingScalar[]>>;
  readonly enumMemberFallbacks: Readonly<Record<string, Readonly<Record<string, SettingScalar>>>>;
  readonly includeHiddenSettings: boolean;
}

export type OptionTypeName =
  | 'STRING'
  | 'NUMBER'
  | 'BIGINT'
  | 'BOOLEAN'
  | 'SELECT'
  | 'SLIDER'
  | 'COMPONENT'
  | 'CUSTOM';

const OPTION_TYPES: Readonly<Record<number, OptionTypeName>> = {
  0: 'STRING',
  1: 'NUMBER',
  2: 'BIGINT',
  3: 'BOOLEAN',
  4: 'SELECT',
  5: 'SLIDER',
  6: 'COMPONENT',
  7: 'CUSTOM',
};

const COMMON_PROFILE = {
  // Mirrors the upstream plugin-list generators: ordinary plugins use a
  // directory index, while required internal plugins are individual files in
  // _core. The sibling _api trees are implementation dependencies rather than
  // user-facing plugins and are intentionally excluded by these globs.
  entryGlobs: ['*/index.{ts,tsx}', '_core/*.{ts,tsx}'],
  // These plugins exist in both trees but expose client-branded descriptions,
  // so sharing one side's generated schema would be misleading to the other.
  clientSpecificPlugins: ['Settings'],
  apiModules: ['@api/Settings', '@utils/types'],
  apiDeclarations: {
    definePlugin: ['@utils/types'],
    definePluginSettings: ['@api/Settings', '@utils/types'],
    migratePluginSetting: ['@api/Settings'],
    migratePluginSettings: ['@api/Settings'],
  },
  optionTypes: OPTION_TYPES,
  supportGlobs: [
    'src/utils/types.ts',
    'src/api/Settings.ts',
    'packages/discord-types/enums/**/*.ts',
    'src/plugins/shikiCodeblocks.desktop/api/themes.ts',
  ],
  controlComponents: {
    Checkbox: 'boolean',
    Switch: 'boolean',
    TextInput: 'string',
    TextArea: 'string',
    Slider: 'number',
    NumberInput: 'number',
    Select: 'enum',
    RadioGroup: 'enum',
    SearchableSelect: 'enum',
    FormSwitch: 'boolean',
  },
  structuredComponentDescriptions: {
    parentSuffix: ' tag',
    childTemplates: {
      text: 'Text for {parent}',
      showInChat: 'Show {parent} in messages',
      showInNotChat: 'Show {parent} in member list and profiles',
    },
  },
  enumFallbacks: {
    ActivityType: [0, 1, 2, 3, 4, 5, 6],
    StatusType: [0, 1, 2, 3],
    ChannelType: [0, 1, 2],
  },
  enumMemberFallbacks: {
    ActivityType: {
      PLAYING: 0,
      STREAMING: 1,
      LISTENING: 2,
      WATCHING: 3,
      CUSTOM_STATUS: 4,
      CUSTOM: 4,
      COMPETING: 5,
      HANG_STATUS: 6,
    },
    StatusType: { ONLINE: 0, IDLE: 1, DND: 2, INVISIBLE: 3 },
    ChannelType: { GUILD_TEXT: 0, DM: 1, GUILD_VOICE: 2 },
    HljsSetting: {
      Never: 'NEVER',
      Secondary: 'SECONDARY',
      Primary: 'PRIMARY',
      Always: 'ALWAYS',
    },
    DeviconSetting: {
      Disabled: 'DISABLED',
      Greyscale: 'GREYSCALE',
      Color: 'COLOR',
    },
    QuestTaskType: {
      STREAM_ON_DESKTOP: 'STREAM_ON_DESKTOP',
      PLAY_ON_DESKTOP: 'PLAY_ON_DESKTOP',
      PLAY_ON_XBOX: 'PLAY_ON_XBOX',
      PLAY_ON_PLAYSTATION: 'PLAY_ON_PLAYSTATION',
      PLAY_ON_DESKTOP_V2: 'PLAY_ON_DESKTOP_V2',
      WATCH_VIDEO: 'WATCH_VIDEO',
      WATCH_VIDEO_ON_MOBILE: 'WATCH_VIDEO_ON_MOBILE',
      PLAY_ACTIVITY: 'PLAY_ACTIVITY',
      ACHIEVEMENT_IN_GAME: 'ACHIEVEMENT_IN_GAME',
      ACHIEVEMENT_IN_ACTIVITY: 'ACHIEVEMENT_IN_ACTIVITY',
    },
    QuestRewardType: {
      REWARD_CODE: 1,
      IN_GAME: 2,
      COLLECTIBLE: 3,
      VIRTUAL_CURRENCY: 4,
      FRACTIONAL_PREMIUM: 5,
    },
  },
  includeHiddenSettings: true,
} as const;

export const SOURCE_PROFILES: Readonly<Record<SourceKind, SourceProfile>> = {
  vencord: COMMON_PROFILE,
  equicord: COMMON_PROFILE,
};
