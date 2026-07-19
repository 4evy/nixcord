export function definePluginSettings(settings: Record<string, unknown>) {
  return {
    ...settings,
    withPrivateSettings: () => settings,
  };
}

export const settings = definePluginSettings({
  enable: {
    type: 'BOOLEAN',
    description: 'Enable',
    default: true,
  },
}).withPrivateSettings<{
  private: boolean;
}>();
