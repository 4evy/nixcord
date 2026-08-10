{
  config,
  lib,
  pkgs,
  nixcordPkgs ? { },
  ...
}:
let

  jsonFormat = pkgs.formats.json { };
  goofcordPackage = if pkgs ? goofcord then pkgs.callPackage ../../pkgs/goofcord.nix { } else null;
  selectedNixcordPkgs = if config.programs.nixcord.useGlobalPkgs then { } else nixcordPkgs;
in
{
  options.programs.nixcord.goofcord = {
    enable = lib.options.mkEnableOption "GoofCord";

    installPackage = lib.options.mkOption {
      type = lib.types.bool;
      default = true;
      description = "Whether to install the GoofCord package.";
    };

    package =
      lib.options.mkPackageOption pkgs "goofcord" {
        nullable = true;
      }
      // {
        default = selectedNixcordPkgs.goofcord or goofcordPackage;
        defaultText = lib.options.literalExpression "pkgs.callPackage ../../pkgs/goofcord.nix { }";
      };

    configDir = lib.options.mkOption {
      type = lib.types.path;
      description = "Directory containing GoofCord's settings.json and assets directory.";
    };

    clientMod = lib.options.mkOption {
      type = lib.types.enum [
        "vencord"
        "equicord"
      ];
      default = "vencord";
      description = "Vencord-based client mod to bundle with GoofCord.";
    };

    settings = lib.options.mkOption {
      type = lib.types.attrsOf jsonFormat.type;
      default = { };
      description = ''
        Settings to be written to GoofCord's settings.json. Entries in `settings.assets` are
        required to be local-path or URL strings and are merged with `extraAssets`; `extraAssets`
        and Nixcord's managed assets take precedence. The internal `managedFiles` setting is
        managed by Nixcord.
      '';
    };

    extraAssets = lib.options.mkOption {
      type = lib.types.attrsOf (lib.types.coercedTo lib.types.path toString lib.types.str);
      default = { };
      description = ''
        Additional local paths or URLs to load through GoofCord's asset loader.
        Nixcord's managed PreVencord, PostVencord, client mod, Quick CSS, and theme assets take precedence.
      '';
    };

    autoscroll.enable = lib.options.mkEnableOption "middle-click autoscrolling for GoofCord";
  };
}
