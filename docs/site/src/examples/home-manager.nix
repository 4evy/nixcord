# home.nix
{ inputs, ... }:
{
  imports = [ inputs.nixcord.homeModules.nixcord ];

  programs.nixcord = {
    enable = true;

    # Explicitly enable Vencord for Discord.
    discord.vencord.enable = true;

    config.plugins = {
      hideMedia.enable = true;
    };
  };
}
