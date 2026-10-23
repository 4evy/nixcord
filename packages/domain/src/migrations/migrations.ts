export type DeprecationInfo = {
  plugin: string;
  setting: string;
  removed: boolean;
  commitDate: string;
  commitHash: string;
};

export type HistoricalPluginRename = {
  oldName: string;
  newName: string;
  commitDate: string;
  commitHash: string;
};

export type PluginDeletion = {
  pluginName: string;
  commitDate: string;
  commitHash: string;
};

export type PluginMigrationInfo = {
  renames: HistoricalPluginRename[];
  deletions: PluginDeletion[];
  settingRemovals?: DeprecationInfo[];
};

/** Days to retain observed plugin renames */
export const RENAME_EXPIRY_DAYS = 40;

/** Days to retain observed plugin removals */
export const REMOVAL_EXPIRY_DAYS = 50;
