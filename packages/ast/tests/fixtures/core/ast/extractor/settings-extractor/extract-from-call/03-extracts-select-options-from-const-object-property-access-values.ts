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
const Quality = {
  High: 1,
  Reasonable: 2,
  Low: 3,
  Horrible: 4,
} as const;
definePluginSettings({
  gifQuality: {
    type: OptionType.SELECT,
    description: 'GIF quality',
    options: [
      { label: 'High', value: Quality.High, default: true },
      { label: 'Reasonable', value: Quality.Reasonable },
      { label: 'Low', value: Quality.Low },
      { label: 'Horrible', value: Quality.Horrible },
    ],
  },
});
