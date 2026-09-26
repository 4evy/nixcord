{ lib, ... }:
{
  imports = [
    ./discord.nix
    ./vesktop.nix
    ./equibop.nix
    ./goofcord.nix
    ./dorion.nix
    ./legcord.nix
    ./vencord-config.nix
    ./legacy.nix
    ./extra.nix
  ];

  options.programs.nixcord = {
    user = lib.options.mkOption {
      type = lib.types.nonEmptyStr;
      description = "User whose client settings Nixcord manages. Home Manager supplies this automatically; set it explicitly for NixOS or nix-darwin.";
    };

    homeDirectory = lib.options.mkOption {
      type = lib.types.path;
      description = "Home directory of the user named by `programs.nixcord.user`.";
    };

    xdgConfigHome = lib.options.mkOption {
      type = lib.types.path;
      description = "Base directory for client configuration on Linux, normally the target user's `.config` directory.";
    };

    enable = lib.options.mkEnableOption "Nixcord client and plugin management";

    useGlobalPkgs = lib.options.mkOption {
      type = lib.types.bool;
      default = true;
      example = false;
      description = ''
        Build Nixcord-provided packages with the host's Nixpkgs package set.
        This reuses the package set already evaluated by Home Manager, NixOS,
        or nix-darwin.

        Set to false to use Nixcord's pinned package set when supplied by the
        module entry point. Evaluating a second Nixpkgs instance uses more
        time and memory.
      '';
    };

    configDir = lib.options.mkOption {
      type = lib.types.path;
      description = "Settings directory for Discord's selected mod, Vencord or Equicord. Other clients have their own `configDir` options.";
    };

    finalPackage = {
      discord = lib.options.mkOption {
        type = lib.types.package;
        readOnly = true;
        description = "The final Discord package for the first configured branch (read-only).";
      };

      discordBranches = lib.options.mkOption {
        type = lib.types.attrsOf lib.types.package;
        readOnly = true;
        description = "The final Discord packages keyed by configured branch (read-only).";
      };

      vesktop = lib.options.mkOption {
        type = lib.types.package;
        readOnly = true;
        description = "The final Vesktop package (read-only).";
      };

      equibop = lib.options.mkOption {
        type = lib.types.nullOr lib.types.package;
        readOnly = true;
        description = "The final Equibop package, or null if unavailable (read-only).";
      };

      goofcord = lib.options.mkOption {
        type = lib.types.nullOr lib.types.package;
        readOnly = true;
        description = "The final GoofCord package, or null if unavailable (read-only).";
      };

      dorion = lib.options.mkOption {
        type = lib.types.package;
        readOnly = true;
        description = "The final Dorion package (read-only).";
      };

      legcord = lib.options.mkOption {
        type = lib.types.package;
        readOnly = true;
        description = "The final Legcord package (read-only).";
      };
    };
  };
}
