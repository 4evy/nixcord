{
  pkgs,
  lib,
  stubs,
}:

{
  hm =
    moduleConfig:
    let
      evaluated = lib.modules.evalModules {
        modules = [
          stubs.hm
          (import ../../hm/default.nix)
          {
            _module.args.clientPackages = { };
            programs.nixcord = moduleConfig;
          }
        ];
        specialArgs = { inherit pkgs; };
      };
    in
    evaluated.config
    // {
      _moduleTest.common = import ../../lib/mkCommonConfig.nix {
        inherit (evaluated) config options;
        inherit lib pkgs;
      };
    };

  nixos =
    moduleConfig:
    (lib.modules.evalModules {
      modules = [
        stubs.nixos
        (import ../../nixos/default.nix)
        {
          _module.args.clientPackages = { };
          programs.nixcord = {
            user = "testuser";
          }
          // moduleConfig;

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
    moduleConfig:
    (lib.modules.evalModules {
      modules = [
        stubs.darwin
        (import ../../darwin/default.nix)
        {
          _module.args.clientPackages = { };
          programs.nixcord = {
            user = "testuser";
          }
          // moduleConfig;

          users.users.testuser = {
            name = "testuser";
            home = "/Users/testuser";
          };
        }
      ];
      specialArgs = { inherit pkgs; };
    }).config;
}
