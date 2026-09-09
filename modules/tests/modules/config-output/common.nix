{ testLib }:
let
  recursiveUpdate = testLib.lib.attrsets.recursiveUpdate;
in
{
  inherit recursiveUpdate;

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

  discordModSettingsSource =
    config:
    if config.home.activation ? nixcord-vencord-settings then
      testLib.output.homeActivationSource config "nixcord-vencord-settings"
    else
      testLib.output.homeActivationSource config "nixcord-equicord-settings";
}
