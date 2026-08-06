{
  config,
  lib,
  pkgs,
  nixcordPkgs ? { },
  ...
}:
let
  inherit (lib)
    literalExpression
    mkEnableOption
    mkOption
    mkPackageOption
    types
    ;

  jsonFormat = pkgs.formats.json { };
  goofcordPackage = if pkgs ? goofcord then pkgs.callPackage ../../pkgs/goofcord.nix { } else null;
  selectedNixcordPkgs = if config.programs.nixcord.useGlobalPkgs then { } else nixcordPkgs;
in
{
  options.programs.nixcord.goofcord = {
    enable = mkEnableOption "GoofCord";

    installPackage = mkOption {
      type = types.bool;
      default = true;
      description = "Whether to install the GoofCord package.";
    };

    package =
      mkPackageOption pkgs "goofcord" {
        nullable = true;
      }
      // {
        default = selectedNixcordPkgs.goofcord or goofcordPackage;
        defaultText = literalExpression "pkgs.callPackage ../../pkgs/goofcord.nix { }";
      };

    configDir = mkOption {
      type = types.path;
      description = "Directory containing GoofCord's settings.json and assets directory.";
    };

    clientMod = mkOption {
      type = types.enum [
        "vencord"
        "equicord"
      ];
      default = "vencord";
      description = "Vencord-based client mod to bundle with GoofCord.";
    };

    settings = mkOption {
      type = types.attrsOf jsonFormat.type;
      default = { };
      description = ''
        Settings to be written to GoofCord's settings.json. Entries in `settings.assets` are
        required to be local-path or URL strings and are merged with `extraAssets`; `extraAssets`
        and Nixcord's managed assets take precedence. The internal `managedFiles` setting is
        managed by Nixcord.
      '';
    };

    extraAssets = mkOption {
      type = types.attrsOf (types.coercedTo types.path toString types.str);
      default = { };
      description = ''
        Additional local paths or URLs to load through GoofCord's asset loader.
        Nixcord's managed PreVencord, PostVencord, client mod, Quick CSS, and theme assets take precedence.
      '';
    };

    autoscroll.enable = mkEnableOption "middle-click autoscrolling for GoofCord";
  };
}
