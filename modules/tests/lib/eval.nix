{
  pkgs,
  lib,
  stubs,
}:

{
  hm =
    nixcordConfig:
    let
      evaluated = lib.evalModules {
        modules = [
          stubs.hm
          (import ../../hm/default.nix)
          {
            _module.args.nixcordPkgs = { };
            programs.nixcord = nixcordConfig;
          }
        ];
        specialArgs = { inherit pkgs; };
      };
    in
    evaluated.config
    // {
      _nixcordTest.common = import ../../lib/mkCommonConfig.nix {
        inherit (evaluated) config;
        inherit lib pkgs;
      };
    };

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

          system.stateVersion = "26.05";
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
