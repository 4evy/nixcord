import { definePluginSettings } from '@api/Settings';
import definePlugin, { OptionType } from '@utils/types';
import { ActivityType } from '../../../packages/discord-types/enums/ActivityType';

const settings = definePluginSettings({
  activity: {
    type: OptionType.SELECT,
    description: 'Activity type',
    options: [
      { label: 'Playing', value: ActivityType.PLAYING },
      { label: 'Streaming', value: ActivityType.STREAMING, default: true },
      { label: 'Listening', value: ActivityType.LISTENING },
    ],
  },
});

export default definePlugin({
  name: 'DiscordEnum',
  description: 'Resolves a Discord enum from the packages tree',
  settings,
});
