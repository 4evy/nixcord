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
const soundTypes = [
  { name: 'Call Calling', id: 'call_calling' },
  { name: 'Mute', id: 'mute' },
] as const;
const allSoundTypes = soundTypes || [];
function makeEmptyOverride() {
  return {
    enabled: false,
    selectedSound: 'default',
    volume: 100,
    useFile: false,
    selectedFileId: undefined,
  };
}
const soundSettings = Object.fromEntries(
  allSoundTypes.map((type) => [
    type.id,
    {
      type: OptionType.STRING,
      description: `Override for ${type.name}`,
      default: JSON.stringify(makeEmptyOverride()),
      hidden: true,
    },
  ])
);
definePluginSettings({
  ...soundSettings,
  overrides: {
    type: OptionType.COMPONENT,
    component: () => null,
  },
});
