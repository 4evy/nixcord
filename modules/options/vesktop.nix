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
  options.programs.nixcord.vesktop = {
    enable = mkEnableOption "Vesktop";
    installPackage = mkOption {
      type = types.bool;
      default = true;
      description = "Whether to install the final Vesktop package.";
    };
    package = mkPackageOption pkgs "vesktop" { };
    useSystemVencord = mkOption {
      type = types.bool;
      default = true;
      description = "Whether to use the system Vencord package instead of the bundled one.";
    };
    configDir = mkOption {
      type = types.path;
      description = "Config directory for Vesktop.";
    };
    settings = mkOption {
      type = types.attrsOf jsonFormat.type;
      default = { };
      description = "Settings to be placed in Vesktop's settings.json.";
    };
    state = mkOption {
      type = types.attrsOf jsonFormat.type;
      default = { };
      description = "State to be placed in Vesktop's state.json.";
    };
    autoscroll.enable = mkEnableOption "middle-click autoscrolling for Vesktop";
  };
}
