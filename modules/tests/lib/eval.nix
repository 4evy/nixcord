{
  pkgs,
  lib,
  stubs,
}:

{
  hm =
    nixcordConfig:
    (lib.evalModules {
      modules = [
        stubs.hm
        (import ../../hm/default.nix)
        {
          _module.args.nixcordPkgs = { };
          programs.nixcord = {
            homeDirectory = "/home/testuser";
            xdgConfigHome = "/home/testuser/.config";
          }
          // nixcordConfig;
        }
      ];
      specialArgs = { inherit pkgs; };
    }).config;

  nixos =
    nixcordConfig:
    (lib.evalModules {
      modules = [
        stubs.nixos
        (import ../../nixos/default.nix)
        {
          _module.args.nixcordPkgs = { };
          programs.nixcord = {
            user = "testuser";
          }
          // nixcordConfig;

          users.users.testuser = {
            name = "testuser";
            home = "/home/testuser";
            isNormalUser = true;
          };

          system.stateVersion = "25.11";
        }
      ];
      specialArgs = { inherit pkgs; };
    }).config;

  darwin =
    nixcordConfig:
    (lib.evalModules {
      modules = [
        stubs.darwin
        (import ../../darwin/default.nix)
        {
          _module.args.nixcordPkgs = { };
          programs.nixcord = {
            user = "testuser";
          }
          // nixcordConfig;

          users.users.testuser = {
            name = "testuser";
            home = "/Users/testuser";
          };
        }
      ];
      specialArgs = { inherit pkgs; };
    }).config;
}
