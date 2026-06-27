{ lib }:

{
  hm =
    { lib, ... }:
    {
      options = {
        home.homeDirectory = lib.mkOption {
          type = lib.types.path;
          default = "/home/testuser";
        };
        home.stateVersion = lib.mkOption {
          type = lib.types.str;
          default = "26.05";
        };
        home.username = lib.mkOption {
          type = lib.types.str;
          default = "testuser";
        };
        xdg.configHome = lib.mkOption {
          type = lib.types.path;
          default = "/home/testuser/.config";
        };
        home.packages = lib.mkOption {
          type = lib.types.listOf lib.types.package;
          default = [ ];
        };
        home.file = lib.mkOption {
          type = lib.types.attrsOf lib.types.anything;
          default = { };
        };
        home.activation = lib.mkOption {
          type = lib.types.attrsOf lib.types.anything;
          default = { };
        };
        warnings = lib.mkOption {
          type = lib.types.listOf lib.types.str;
          default = [ ];
        };
        assertions = lib.mkOption {
          type = lib.types.listOf lib.types.anything;
          default = [ ];
        };
      };
    };

  nixos =
    { lib, ... }:
    {
      options = {
        users.users = lib.mkOption {
          type = lib.types.attrsOf (
            lib.types.submodule {
              options = {
                name = lib.mkOption { type = lib.types.str; };
                home = lib.mkOption {
                  type = lib.types.path;
                  default = "/home/user";
                };
                isNormalUser = lib.mkOption {
                  type = lib.types.bool;
                  default = false;
                };
              };
            }
          );
          default = { };
        };
        boot.loader.grub.devices = lib.mkOption {
          type = lib.types.listOf lib.types.str;
          default = [ ];
        };
        fileSystems = lib.mkOption {
          type = lib.types.attrsOf lib.types.anything;
          default = { };
        };
        system.stateVersion = lib.mkOption {
          type = lib.types.str;
          default = "26.05";
        };
        nixpkgs.config.allowUnfree = lib.mkOption {
          type = lib.types.bool;
          default = false;
        };
        nixpkgs.hostPlatform = lib.mkOption {
          type = lib.types.anything;
          default = null;
        };
        environment.systemPackages = lib.mkOption {
          type = lib.types.listOf lib.types.package;
          default = [ ];
        };
        system.activationScripts = lib.mkOption {
          type = lib.types.attrsOf lib.types.anything;
          default = { };
        };
        warnings = lib.mkOption {
          type = lib.types.listOf lib.types.str;
          default = [ ];
        };
        assertions = lib.mkOption {
          type = lib.types.listOf lib.types.anything;
          default = [ ];
        };
      };
    };

  darwin =
    { lib, ... }:
    {
      options = {
        users.users = lib.mkOption {
          type = lib.types.attrsOf (
            lib.types.submodule {
              options = {
                name = lib.mkOption { type = lib.types.str; };
                home = lib.mkOption {
                  type = lib.types.path;
                  default = "/Users/user";
                };
              };
            }
          );
          default = { };
        };
        environment.systemPackages = lib.mkOption {
          type = lib.types.listOf lib.types.package;
          default = [ ];
        };
        nixpkgs.config.allowUnfree = lib.mkOption {
          type = lib.types.bool;
          default = false;
        };
        nixpkgs.hostPlatform = lib.mkOption {
          type = lib.types.anything;
          default = null;
        };
        system.stateVersion = lib.mkOption {
          type = lib.types.anything;
          default = 6;
        };
        system.activationScripts = lib.mkOption {
          type = lib.types.attrsOf lib.types.anything;
          default = { };
        };
        warnings = lib.mkOption {
          type = lib.types.listOf lib.types.str;
          default = [ ];
        };
        assertions = lib.mkOption {
          type = lib.types.listOf lib.types.anything;
          default = [ ];
        };
      };
    };
}
