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
const IS_MAC = false;
function definePluginSettings(settings: Record<string, unknown>) {
  return settings;
}
const DEFAULT_KEYS = IS_MAC ? ['Meta', 'Shift', 'P'] : ['Control', 'Shift', 'P'];
definePluginSettings({
  hotkey: {
    type: OptionType.COMPONENT,
    default: DEFAULT_KEYS,
    component: () => null,
  },
});
