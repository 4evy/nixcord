# home-manager.nix
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
    inputs.nixcord.homeModules.nixcord
    matrix.scenarios.${scenario}.module
  ];

  home = {
    username = "demo";
    homeDirectory = "/home/demo";
    stateVersion = "26.05";
  };

  xdg.configHome = "/home/demo/.config";
}
