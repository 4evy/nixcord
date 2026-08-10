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
      description = "Target username for file ownership.";
    };

    homeDirectory = lib.options.mkOption {
      type = lib.types.path;
      description = "Home directory for the target user.";
    };

    xdgConfigHome = lib.options.mkOption {
      type = lib.types.path;
      description = "XDG config home directory.";
    };

    enable = lib.options.mkEnableOption "nixcord (Discord with Vencord/Equicord)";

    useGlobalPkgs = lib.options.mkOption {
      type = lib.types.bool;
      default = true;
      example = false;
      description = ''
        Whether to build Nixcord-provided packages with the package set passed
        to the module instead of Nixcord's pinned package set.

        Keeping this enabled reuses the package set that Home Manager, NixOS,
        or nix-darwin has already evaluated. Disabling it evaluates Nixcord's
        pinned package set as an additional Nixpkgs instance, which is more
        isolated but substantially increases evaluation time and memory use.
      '';
    };

    configDir = lib.options.mkOption {
      type = lib.types.path;
      description = "Config directory for the selected client (Vencord or Equicord).";
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
