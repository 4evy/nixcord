{ lib, ... }:
let
  inherit (lib) mkEnableOption mkOption types;
in
{
  imports = [
    ./discord.nix
    ./vesktop.nix
    ./equibop.nix
    ./dorion.nix
    ./legcord.nix
    ./vencord-config.nix
    ./legacy.nix
    ./extra.nix
  ];

  options.programs.nixcord = {
    user = mkOption {
      type = types.nonEmptyStr;
      description = "Target username for file ownership.";
    };

    homeDirectory = mkOption {
      type = types.path;
      description = "Home directory for the target user.";
    };

    xdgConfigHome = mkOption {
      type = types.path;
      description = "XDG config home directory.";
    };

    enable = mkEnableOption "nixcord (Discord with Vencord/Equicord)";

    configDir = mkOption {
      type = types.path;
      description = "Config directory for the selected client (Vencord or Equicord).";
    };

    finalPackage = {
      discord = mkOption {
        type = types.package;
        readOnly = true;
        description = "The final Discord package (read-only).";
      };

      vesktop = mkOption {
        type = types.package;
        readOnly = true;
        description = "The final Vesktop package (read-only).";
      };

      equibop = mkOption {
        type = types.nullOr types.package;
        readOnly = true;
        description = "The final Equibop package, or null if unavailable (read-only).";
      };

      dorion = mkOption {
        type = types.package;
        readOnly = true;
        description = "The final Dorion package (read-only).";
      };

      legcord = mkOption {
        type = types.package;
        readOnly = true;
        description = "The final Legcord package (read-only).";
      };
    };
  };
}
