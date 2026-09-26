# configuration.nix
{ inputs, ... }:
{
  imports = [ inputs.nixcord.nixosModules.nixcord ];

  programs.nixcord = {
    enable = true;
    user = "your-username";
    discord.vencord.enable = true;
    config.plugins.hideMedia.enable = true;
  };
}
