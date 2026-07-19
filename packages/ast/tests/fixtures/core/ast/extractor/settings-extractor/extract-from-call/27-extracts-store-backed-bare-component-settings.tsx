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
function SoundIdInput() {
  const { soundId } = settings.use(['soundId']);
  return <TextInput value={soundId} onChange={(v) => (settings.store.soundId = v)} />;
}
const settings = definePluginSettings({
  soundId: {
    type: OptionType.COMPONENT,
    description: 'Enter the ID of the sound you want to play.',
    component: SoundIdInput,
  },
  scanQr: {
    type: OptionType.COMPONENT,
    description: 'Scan a QR code',
    component: () => <Button />,
  },
});
