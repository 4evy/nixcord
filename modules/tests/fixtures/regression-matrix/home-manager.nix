# home-manager.nix
{
  inputs,
  lib,
  pkgs,
  scenario,
  ...
}@args:
let
  pluginRoot = args.pluginRoot or ../../../plugins;
  matrix = import ./scenarios.nix { inherit lib pluginRoot; };
  goofcordPackage = pkgs.runCommandLocal "nixcord-regression-goofcord" { } "mkdir $out";
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

  programs.nixcord.goofcord.package =
    lib.mkIf matrix.scenarios.${scenario}.expected.goofcord
      goofcordPackage;
}
