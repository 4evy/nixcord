function definePluginSettings(settings: Record<string, unknown>) {
  return {
    ...settings,
    withPrivateSettings<T extends object>() {
      return this as typeof this & T;
    },
  };
}
const settings = definePluginSettings({}).withPrivateSettings<{
  type?: ActivityType;
}>();
