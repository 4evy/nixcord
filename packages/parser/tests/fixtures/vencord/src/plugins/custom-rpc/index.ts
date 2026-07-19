import { definePluginSettings } from '@api/Settings';
import definePlugin, { OptionType } from '@utils/types';
import { ActivityType } from '../../../packages/discord-types/enums/ActivityType';

enum TimestampMode {
  NONE,
  NOW,
  TIME,
  CUSTOM,
}

const settings = definePluginSettings({
  config: {
    type: OptionType.COMPONENT,
    component: () => null,
  },
}).withPrivateSettings<{
  appID?: string;
  type?: ActivityType;
  timestampMode?: TimestampMode;
  startTime?: number;
}>();

export default definePlugin({
  name: 'CustomRPC',
  description: 'A private-settings schema representative',
  settings,
});
