export const enum OptionType {
  STRING = 0,
  NUMBER = 1,
  BIGINT = 2,
  BOOLEAN = 3,
  SELECT = 4,
  SLIDER = 5,
  COMPONENT = 6,
  CUSTOM = 7,
}
function definePluginSettings(settings: Record<string, unknown>) {
  return settings;
}
const tags = [
  {
    name: 'WEBHOOK',
    displayName: 'Webhook',
    description: 'Messages sent by webhooks',
  },
  {
    name: 'MODERATOR_STAFF',
    displayName: 'Staff',
    description: 'Can manage the server, channels or roles',
  },
] as const;
function SettingsComponent() {
  const tagSettings = (settings.store.tagSettings ??= {});
  tags.forEach((t) => {
    if (!tagSettings[t.name]) {
      tagSettings[t.name] = {
        text: t.displayName,
        showInChat: true,
        showInNotChat: true,
      };
    }
  });
  return <div />;
}
const settings = definePluginSettings({
  tagSettings: {
    type: OptionType.COMPONENT,
    component: SettingsComponent,
    description: 'fill me',
  },
});
