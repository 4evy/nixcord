import { definePluginSettings } from '@api/Settings';
import definePlugin, { OptionType } from '@utils/types';

export const settings = definePluginSettings({
  message: {
    type: OptionType.STRING,
    description: 'Uses the directory-derived plugin name',
    default: 'hello',
  },
});

export default definePlugin({
  description: 'Uses the directory-derived plugin name',
  settings,
} as any);
