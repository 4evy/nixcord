{
  config,
  lib,
  pkgs,
  nixcordPkgs ? { },
  ...
}:
let

  jsonFormat = pkgs.formats.json { };
  goofcordPackage = if pkgs ? goofcord then pkgs.callPackage ../../pkgs/goofcord { } else null;
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
        defaultText = lib.options.literalExpression "pkgs.callPackage ../../pkgs/goofcord { }";
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
      description = "Mod to build and bundle with GoofCord: Vencord or Equicord.";
    };

    settings = lib.options.mkOption {
      type = lib.types.attrsOf jsonFormat.type;
      default = { };
      description = ''
        Native GoofCord preferences written to `settings.json`. Put plugin
        settings in `config.plugins` or `goofcordConfig.plugins`.

        Values in `settings.assets` must be local-path or URL strings.
        `extraAssets` overrides matching entries, and Nixcord's bundled assets
        override both. Nixcord also sets `managedFiles` to track those assets.
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
