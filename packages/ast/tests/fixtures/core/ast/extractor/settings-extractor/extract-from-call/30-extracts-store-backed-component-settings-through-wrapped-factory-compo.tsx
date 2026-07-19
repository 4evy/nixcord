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
const ErrorBoundary = { wrap: (component) => component };
function createDirSelector(settingKey: 'logsDir' | 'imageCacheDir', successMessage: string) {
  return function DirSelector() {
    return <FolderInput settingsKey={settingKey} successMessage={successMessage} />;
  };
}
const ImageCacheDir = createDirSelector('imageCacheDir', 'Successfully updated Image Cache Dir');
function FolderInput({ settingsKey, successMessage }) {
  const path = settings.store[settingsKey];
  return (
    <Button
      onClick={() => {
        settings.store[settingsKey] = successMessage;
      }}
    >
      {path}
    </Button>
  );
}
const settings = definePluginSettings({
  imageCacheDir: {
    type: OptionType.COMPONENT,
    description: 'Select saved images directory',
    component: ErrorBoundary.wrap(ImageCacheDir) as any,
  },
});
