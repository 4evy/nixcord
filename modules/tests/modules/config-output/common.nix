{ testLib }:
{
  inherit (testLib.lib) recursiveUpdate;

  baseConfig = {
    enable = true;
    discord.vencord.enable = true;
    configDir = "/home/testuser/.config/Vencord";
    discord.configDir = "/home/testuser/.config/discord";
  };

  vesktopBaseConfig = {
    enable = true;
    discord.enable = false;
    vesktop.enable = true;
    vesktop.configDir = "/home/testuser/.config/vesktop";
  };

  discordModSettingsJSON =
    config:
    if config.home.activation ? nixcord-vencord-settings then
      testLib.output.homeActivationInstallJSON config "nixcord-vencord-settings"
    else
      testLib.output.homeActivationInstallJSON config "nixcord-equicord-settings";
}
