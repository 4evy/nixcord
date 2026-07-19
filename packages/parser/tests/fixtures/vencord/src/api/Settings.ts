export type PluginSettings = Record<string, unknown>;

export function definePluginSettings<T extends PluginSettings>(settings: T) {
  return {
    ...settings,
    withPrivateSettings<_U>() {
      return this;
    },
  };
}

export function migratePluginSettings(_newName: string, ..._oldNames: string[]) {}

export function migratePluginSetting(
  _pluginName: string,
  _oldSetting: string,
  _newSetting: string
) {}
