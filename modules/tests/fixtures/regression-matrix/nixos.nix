# nixos.nix
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
    inputs.nixcord.nixosModules.nixcord
    matrix.scenarios.${scenario}.module
  ];

  nixpkgs.config.allowUnfree = true;

  boot.loader.grub.devices = [ "nodev" ];
  fileSystems."/".device = "tmpfs";
  fileSystems."/".fsType = "tmpfs";

  users.users.demo = {
    isNormalUser = true;
    home = "/home/demo";
  };

  programs.nixcord = {
    user = "demo";
    goofcord.package = lib.modules.mkIf matrix.scenarios.${scenario}.expected.goofcord goofcordPackage;
  };

  system.stateVersion = "26.05";
}
