# darwin-configuration.nix
{ inputs, ... }:
{
  imports = [ inputs.nixcord.darwinModules.nixcord ];

  programs.nixcord = {
    enable = true;
    user = "your-username"; # Needed for system-level config
  };
}
