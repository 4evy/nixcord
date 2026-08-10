{
  hm =
    { lib, ... }:
    {
      options = {
        home = {
          homeDirectory = lib.options.mkOption {
            type = lib.types.path;
            default = "/home/testuser";
          };
          stateVersion = lib.options.mkOption {
            type = lib.types.str;
            default = "26.05";
          };
          username = lib.options.mkOption {
            type = lib.types.str;
            default = "testuser";
          };
          packages = lib.options.mkOption {
            type = lib.types.listOf lib.types.package;
            default = [ ];
          };
          file = lib.options.mkOption {
            type = lib.types.attrsOf lib.types.anything;
            default = { };
          };
          activation = lib.options.mkOption {
            type = lib.types.attrsOf lib.types.anything;
            default = { };
          };
        };
        xdg.configHome = lib.options.mkOption {
          type = lib.types.path;
          default = "/home/testuser/.config";
        };
        warnings = lib.options.mkOption {
          type = lib.types.listOf lib.types.str;
          default = [ ];
        };
        assertions = lib.options.mkOption {
          type = lib.types.listOf lib.types.anything;
          default = [ ];
        };
      };
    };

  nixos =
    { lib, ... }:
    {
      options = {
        users.users = lib.options.mkOption {
          type = lib.types.attrsOf (
            lib.types.submodule {
              options = {
                name = lib.options.mkOption { type = lib.types.str; };
                home = lib.options.mkOption {
                  type = lib.types.path;
                  default = "/home/user";
                };
                isNormalUser = lib.options.mkOption {
                  type = lib.types.bool;
                  default = false;
                };
              };
            }
          );
          default = { };
        };
        boot.loader.grub.devices = lib.options.mkOption {
          type = lib.types.listOf lib.types.str;
          default = [ ];
        };
        fileSystems = lib.options.mkOption {
          type = lib.types.attrsOf lib.types.anything;
          default = { };
        };
        system.stateVersion = lib.options.mkOption {
          type = lib.types.str;
          default = "26.05";
        };
        nixpkgs.config.allowUnfree = lib.options.mkOption {
          type = lib.types.bool;
          default = false;
        };
        nixpkgs.hostPlatform = lib.options.mkOption {
          type = lib.types.anything;
          default = null;
        };
        environment.systemPackages = lib.options.mkOption {
          type = lib.types.listOf lib.types.package;
          default = [ ];
        };
        system.activationScripts = lib.options.mkOption {
          type = lib.types.attrsOf lib.types.anything;
          default = { };
        };
        warnings = lib.options.mkOption {
          type = lib.types.listOf lib.types.str;
          default = [ ];
        };
        assertions = lib.options.mkOption {
          type = lib.types.listOf lib.types.anything;
          default = [ ];
        };
      };
    };

  darwin =
    { lib, ... }:
    {
      options = {
        users.users = lib.options.mkOption {
          type = lib.types.attrsOf (
            lib.types.submodule {
              options = {
                name = lib.options.mkOption { type = lib.types.str; };
                home = lib.options.mkOption {
                  type = lib.types.nullOr lib.types.path;
                  default = null;
                };
              };
            }
          );
          default = { };
        };
        environment.systemPackages = lib.options.mkOption {
          type = lib.types.listOf lib.types.package;
          default = [ ];
        };
        nixpkgs.config.allowUnfree = lib.options.mkOption {
          type = lib.types.bool;
          default = false;
        };
        nixpkgs.hostPlatform = lib.options.mkOption {
          type = lib.types.anything;
          default = null;
        };
        system.stateVersion = lib.options.mkOption {
          type = lib.types.anything;
          default = 6;
        };
        system.activationScripts = lib.options.mkOption {
          type = lib.types.attrsOf (
            lib.types.submodule {
              options.text = lib.options.mkOption {
                type = lib.types.lines;
                default = "";
              };
            }
          );
          default = { };
        };
        warnings = lib.options.mkOption {
          type = lib.types.listOf lib.types.str;
          default = [ ];
        };
        assertions = lib.options.mkOption {
          type = lib.types.listOf lib.types.anything;
          default = [ ];
        };
      };
    };
}
