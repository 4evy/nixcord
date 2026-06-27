# nix-darwin.nix
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
