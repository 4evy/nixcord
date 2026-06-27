# home-manager.nix
{
  inputs,
  lib,
  ...
}@args:
let
  pluginRoot = args.pluginRoot or ../../../plugins;
  matrix = import ./scenarios.nix { inherit lib pluginRoot; };
  scenario = args.scenario or matrix.defaultScenario;
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
