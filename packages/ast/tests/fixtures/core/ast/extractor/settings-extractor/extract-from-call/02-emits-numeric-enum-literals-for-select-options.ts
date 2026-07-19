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
const enum Spacing {
  COMPACT,
  COZY,
}
definePluginSettings({
  iconSpacing: {
    type: OptionType.SELECT,
    description: 'Spacing',
    options: [
      { label: 'Compact', value: Spacing.COMPACT },
      { label: 'Cozy', value: Spacing.COZY },
    ],
    default: Spacing.COZY,
  },
});
