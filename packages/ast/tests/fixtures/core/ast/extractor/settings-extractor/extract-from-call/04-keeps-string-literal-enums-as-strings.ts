import { definePluginSettings, OptionType } from '@utils/types';

const settings = definePluginSettings({
  automodEmbeds: {
    type: OptionType.SELECT,
    description: 'Embeds',
    options: [
      { label: 'Always', value: 'always' },
      { label: 'Never', value: 'never' },
    ],
    default: 'always',
  },
});
