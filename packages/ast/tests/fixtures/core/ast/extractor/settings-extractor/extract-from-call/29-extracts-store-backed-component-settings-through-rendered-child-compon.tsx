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
function Picker() {
  const { streamMedia } = settings.use(['streamMedia']);
  return (
    <SearchableSelect value={streamMedia} onChange={(v) => (settings.store.streamMedia = v)} />
  );
}
function SettingSection() {
  return <Picker />;
}
const settings = definePluginSettings({
  streamMedia: {
    type: OptionType.COMPONENT,
    component: SettingSection,
  },
});
