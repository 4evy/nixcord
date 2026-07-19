import { migratePluginSetting, migratePluginSettings } from '@api/Settings';
import definePlugin from '@utils/types';

migratePluginSettings('RenamedPlugin', 'OldPlugin', 'OlderPlugin');
migratePluginSetting('RenamedPlugin', 'oldName', 'newName');

export default definePlugin({
  name: 'RenamedPlugin',
  description: 'A plugin with source migrations',
});
