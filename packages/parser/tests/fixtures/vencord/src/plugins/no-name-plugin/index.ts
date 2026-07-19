import { definePluginSettings } from '@api/Settings';
import { OptionType } from '@utils/types';

export const settings = definePluginSettings({
  message: {
    type: OptionType.STRING,
    description: 'Uses the directory-derived plugin name',
    default: 'hello',
  },
});
