{ lib, pkgs, ... }:
let
  inherit (lib)
    mkEnableOption
    mkOption
    mkPackageOption
    types
    ;
  jsonFormat = pkgs.formats.json { };
in
{
  options.programs.nixcord.legcord = {
    enable = mkEnableOption "Legcord";
    installPackage = mkOption {
      type = types.bool;
      default = true;
      description = "Whether to install the Legcord package.";
    };
    package = mkPackageOption pkgs "legcord" { };
    configDir = mkOption {
      type = types.path;
      description = "Config directory for Legcord.";
    };
    vencord = {
      enable = mkEnableOption "bundling Vencord for Legcord (includes userPlugins)";
    };
    equicord = {
      enable = mkEnableOption "bundling Equicord for Legcord (includes userPlugins)";
    };
    settings = mkOption {
      type = types.attrsOf jsonFormat.type;
      default = { };
      description = "Settings to be written to Legcord's storage/settings.json.";
      example = {
        channel = "stable";
        tray = "dynamic";
        minimizeToTray = true;
        hardwareAcceleration = true;
        mods = [ "vencord" ];
        doneSetup = true;
      };
    };
  };
}
