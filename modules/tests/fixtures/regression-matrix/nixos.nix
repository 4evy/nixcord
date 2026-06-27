# nixos.nix
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

  programs.nixcord.user = "demo";

  system.stateVersion = "26.05";
}
