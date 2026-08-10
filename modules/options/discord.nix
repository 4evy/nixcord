{
  config,
  lib,
  pkgs,
  nixcordPkgs ? { },
  ...
}:
let
  branchType = lib.types.enum [
    "stable"
    "ptb"
    "canary"
    "development"
  ];
  jsonFormat = pkgs.formats.json { };
  vencordPackage = pkgs.callPackage ../../pkgs/vencord.nix { };
  equicordPackage = pkgs.callPackage ../../pkgs/equicord.nix { };
  openasarPackage = pkgs.openasar;
  selectedNixcordPkgs = if config.programs.nixcord.useGlobalPkgs then { } else nixcordPkgs;

in
{
  options.programs.nixcord.discord = {
    enable = lib.options.mkOption {
      type = lib.types.bool;
      default = true;
      description = "Whether to enable Discord. Disable to only install Vesktop.";
      example = false;
    };
    installPackage = lib.options.mkOption {
      type = lib.types.bool;
      default = true;
      description = "Whether to install the final Discord package.";
    };
    package = lib.options.mkPackageOption pkgs "Discord" { default = "discord"; } // {
      default = pkgs.callPackage ../../pkgs/discord (
        {
          openasar = selectedNixcordPkgs.openasar or openasarPackage;
        }
        //
          lib.attrsets.optionalAttrs
            (pkgs.stdenvNoCC.isLinux && lib.strings.versionOlder lib.trivial.version "25")
            {
              libgbm = pkgs.mesa;
            }
      );
      defaultText = lib.options.literalExpression "pkgs.callPackage ../../pkgs/discord { }";
    };
    branches = lib.options.mkOption {
      type = lib.types.nonEmptyListOf branchType;
      default = [ "stable" ];
      apply = lib.lists.unique;
      description = ''
        The Discord branches to install and manage simultaneously. All selected
        branches use the same Vencord or Equicord configuration and Discord
        package options. The first branch is exposed as `finalPackage.discord`
        and determines the default value of `discord.configDir`.
      '';
      example = [
        "stable"
        "ptb"
        "canary"
      ];
    };
    configDir = lib.options.mkOption {
      type = lib.types.path;
      description = "Config directory for Discord.";
    };
    vencord = {
      enable = lib.options.mkEnableOption "Vencord for Discord (non-Vesktop)";
      package = lib.options.mkPackageOption pkgs "Vencord" { default = "vencord"; } // {
        default = selectedNixcordPkgs.vencord or vencordPackage;
        defaultText = lib.options.literalExpression "pkgs.callPackage ../../pkgs/vencord.nix { }";
      };
    };
    equicord = {
      enable = lib.options.mkEnableOption "Equicord (alternative to Vencord)";
      package = lib.options.mkPackageOption pkgs "Equicord" { default = "equicord"; } // {
        default = selectedNixcordPkgs.equicord or equicordPackage;
        defaultText = lib.options.literalExpression "pkgs.callPackage ../../pkgs/equicord.nix { }";
      };
    };
    silenceNoModClientWarning = lib.options.mkOption {
      type = lib.types.bool;
      default = false;
      example = true;
      description = ''
        Whether to acknowledge and silence the warning shown when Discord is
        enabled without Vencord or Equicord.
      '';
    };
    openASAR.enable = lib.options.mkEnableOption "OpenASAR for Discord (non-Vesktop)" // {
      default = true;
    };
    krisp.enable = lib.options.mkEnableOption "Krisp noise cancellation";
    commandLineArgs = lib.options.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [ ];
      description = "Additional command line arguments to pass to Discord.";
      example = [
        "--enable-features=VaapiVideoDecoder,MiddleClickAutoscroll"
        "--ozone-platform-hint=auto"
        "--enable-wayland-ime"
      ];
    };
    settings = lib.options.mkOption {
      type = lib.types.attrsOf jsonFormat.type;
      default = { };
      description = "Settings to be placed in Discord's settings.json. Set atomically; the entire attrset replaces any previous definition.";
      example = {
        openasar.setup = true;
      };
    };
  };

}
