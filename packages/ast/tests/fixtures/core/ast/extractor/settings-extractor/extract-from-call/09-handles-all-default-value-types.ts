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
definePluginSettings({
  boolSetting: {
    type: OptionType.BOOLEAN,
    default: true,
  },
  strSetting: {
    type: OptionType.STRING,
    default: 'test',
  },
  intSetting: {
    type: OptionType.NUMBER,
    default: 42,
  },
  floatSetting: {
    type: OptionType.NUMBER,
    default: 3.14,
  },
});
