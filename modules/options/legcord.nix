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
      description = "Directory containing Legcord's `storage/settings.json` and bundled mods.";
    };
    vencord = {
      enable = lib.options.mkEnableOption "a Vencord bundle for Legcord, including `userPlugins`";
    };
    equicord = {
      enable = lib.options.mkEnableOption "an Equicord bundle for Legcord, including `userPlugins`";
    };
    settings = lib.options.mkOption {
      type = lib.types.attrsOf jsonFormat.type;
      default = { };
      description = "Native Legcord preferences written to `storage/settings.json`. Nixcord selects the mod and disables bundle updates when you enable a bundled mod.";
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
