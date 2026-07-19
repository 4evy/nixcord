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
  choice: {
    type: OptionType.SELECT,
    description: 'Choose option',
    options: [{ value: 'option1' }, { value: 'option2' }],
  },
  enabled: {
    type: OptionType.BOOLEAN,
    description: 'Enable feature',
    default: true,
  },
  message: {
    type: OptionType.STRING,
    description: 'Message',
    default: 'test',
  },
});
