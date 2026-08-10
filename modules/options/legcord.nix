{ lib, pkgs, ... }:
let
  jsonFormat = pkgs.formats.json { };
in
{
  options.programs.nixcord.legcord = {
    enable = lib.options.mkEnableOption "Legcord";
    installPackage = lib.options.mkOption {
      type = lib.types.bool;
      default = true;
      description = "Whether to install the Legcord package.";
    };
    package = lib.options.mkPackageOption pkgs "legcord" { };
    configDir = lib.options.mkOption {
      type = lib.types.path;
      description = "Config directory for Legcord.";
    };
    vencord = {
      enable = lib.options.mkEnableOption "bundling Vencord for Legcord (includes userPlugins)";
    };
    equicord = {
      enable = lib.options.mkEnableOption "bundling Equicord for Legcord (includes userPlugins)";
    };
    settings = lib.options.mkOption {
      type = lib.types.attrsOf jsonFormat.type;
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
