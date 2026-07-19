import { definePluginSettings } from '@api/Settings';
import { OptionType } from '@utils/types';

export const settings = definePluginSettings({
  enabled: {
    type: OptionType.BOOLEAN,
    description: 'Nested setting',
    default: true,
  },
});
