# home.nix
{ inputs, ... }:
{
  imports = [ inputs.nixcord.homeModules.nixcord ];

  programs.nixcord = {
    enable = true;

    discord.vencord.enable = true;

    config.plugins = {
      hideMedia.enable = true;
    };
  };
}
