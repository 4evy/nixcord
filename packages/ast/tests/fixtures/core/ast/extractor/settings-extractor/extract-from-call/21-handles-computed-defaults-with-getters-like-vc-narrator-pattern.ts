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
const getDefaultVoice = () => ({ voiceURI: 'default-voice' });
definePluginSettings({
  voice: {
    type: OptionType.COMPONENT,
    component: () => null,
    get default() {
      return getDefaultVoice()?.voiceURI;
    },
  },
  volume: {
    type: OptionType.SLIDER,
    description: 'Volume',
    default: 1,
  },
});
