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
function definePluginSettings(settings: Record<string, unknown>) {
  return settings;
}
definePluginSettings(
  Object.entries({
    spotify: { description: 'Open Spotify links in app' },
    steam: { description: 'Open Steam links in app' },
  }).reduce(
    (acc, [key, rule]) => {
      acc[key] = {
        type: OptionType.BOOLEAN,
        description: rule.description,
        default: true,
      };
      return acc;
    },
    {} as Record<string, unknown>
  )
);
