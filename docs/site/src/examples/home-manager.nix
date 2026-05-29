# home.nix
{ inputs, ... }:
{
  imports = [ inputs.nixcord.homeModules.nixcord ];

  programs.nixcord = {
    enable = true;

    # Explicit; this is also the default client.
    discord.vencord.enable = true;

    config.plugins = {
      hideAttachments.enable = true;
    };
  };
}
