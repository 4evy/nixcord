import { definePluginSettings } from '@api/Settings';
import definePlugin, { OptionType } from '@utils/types';

const settings = definePluginSettings({
  disableAnalytics: {
    type: OptionType.BOOLEAN,
    description: 'Disable analytics',
    default: true,
    restartNeeded: true,
  },
});

export default definePlugin({
  name: 'NoTrack',
  description: 'Required core plugin',
  settings,
});
