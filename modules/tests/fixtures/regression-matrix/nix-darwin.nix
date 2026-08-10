# nix-darwin.nix
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
    inputs.nixcord.darwinModules.nixcord
    matrix.scenarios.${scenario}.module
  ];

  nixpkgs.config.allowUnfree = true;

  users.users.demo = {
    name = "demo";
    home = "/Users/demo";
  };

  programs.nixcord = {
    user = "demo";
    goofcord.package = lib.modules.mkIf matrix.scenarios.${scenario}.expected.goofcord goofcordPackage;
  };

  system.stateVersion = 6;
}
