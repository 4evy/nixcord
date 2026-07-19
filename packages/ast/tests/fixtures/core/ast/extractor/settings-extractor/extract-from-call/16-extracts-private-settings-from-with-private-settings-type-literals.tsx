export const enum OptionType {
  STRING = 0,
  NUMBER = 1,
  BIGINT = 2,
  BOOLEAN = 3,
  SELECT = 4,
  SLIDER = 5,
  COMPONENT = 6,
  CUSTOM = 7,
}
export const enum ActivityType {
  PLAYING,
  STREAMING,
  LISTENING,
  WATCHING,
  CUSTOM_STATUS,
  COMPETING,
  HANG_STATUS,
}
export const enum TimestampMode {
  NONE,
  NOW,
  TIME,
  CUSTOM,
}
function definePluginSettings(settings: Record<string, unknown>) {
  return {
    ...settings,
    withPrivateSettings<T extends object>() {
      return this as typeof this & T;
    },
  };
}
const settings = definePluginSettings({
  config: {
    type: OptionType.COMPONENT,
    component: () => null,
  },
}).withPrivateSettings<{
  appID?: string;
  appName?: string;
  type?: ActivityType;
  timestampMode?: TimestampMode;
  startTime?: number;
  loop?: boolean;
  multiGreetChoices?: string[];
  nestedFolders: Record<string, string>;
  formats: {
    cozyFormat: string;
    compactFormat: string;
  };
}>();
