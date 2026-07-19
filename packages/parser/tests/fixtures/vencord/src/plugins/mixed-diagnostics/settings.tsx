import { definePluginSettings } from '@api/Settings';
import { OptionType } from '@utils/types';

export default definePluginSettings({
  enabled: {
    type: OptionType.BOOLEAN,
    description: 'Enable it',
    default: true,
  },
  preview: {
    type: OptionType.COMPONENT,
    component: () => null,
  },
});
