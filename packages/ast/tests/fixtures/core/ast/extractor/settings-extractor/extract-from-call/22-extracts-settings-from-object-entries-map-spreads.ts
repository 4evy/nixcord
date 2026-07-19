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
const indicatorLocations = {
  list: { description: 'In the member list' },
  badges: { description: 'In user profiles, as badges' },
  messages: { description: 'Inside messages' },
};
definePluginSettings({
  ...Object.fromEntries(
    Object.entries(indicatorLocations).map(([key, value]) => {
      return [
        key,
        {
          type: OptionType.BOOLEAN,
          description: `Show indicators ${value.description.toLowerCase()}`,
          restartNeeded: true,
          default: true,
        },
      ];
    })
  ),
  colorMobileIndicator: {
    type: OptionType.BOOLEAN,
    description: 'Whether to make the mobile indicator match the color of the user status.',
    default: true,
  },
});
