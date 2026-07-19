# nix-darwin.nix
{
  inputs,
  lib,
  scenario,
  ...
}@args:
let
  pluginRoot = args.pluginRoot or ../../../plugins;
  matrix = import ./scenarios.nix { inherit lib pluginRoot; };
in
{
  imports = [
    inputs.nixcord.darwinModules.nixcord
    matrix.scenarios.${scenario}.module
  ];

  nixpkgs.config.allowUnfree = true;

  users.users.demo = {
    name = "demo";
    home = "/Users/demo";
  };

  programs.nixcord.user = "demo";

  system.stateVersion = 6;
}
