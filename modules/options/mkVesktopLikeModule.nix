{
  moduleName,
  displayName,
  modName,
  useSystemOption,
  nullPackageOnDarwin ? false,
}:
{
  lib,
  pkgs,
  ...
}:
let
  inherit (lib)
    literalExpression
    mkEnableOption
    mkOption
    mkPackageOption
    optionalAttrs
    types
    ;

  jsonFormat = pkgs.formats.json { };

  packageOption =
    mkPackageOption pkgs displayName {
      default = moduleName;
      nullable = nullPackageOnDarwin;
    }
    // optionalAttrs nullPackageOnDarwin {
      default = if pkgs.stdenvNoCC.isDarwin then null else pkgs.${moduleName} or null;
      defaultText = literalExpression "if pkgs.stdenvNoCC.isDarwin then null else pkgs.${moduleName} or null";
    };
in
{
  options.programs.nixcord.${moduleName} = {
    enable = mkEnableOption displayName;

    installPackage = mkOption {
      type = types.bool;
      default = true;
      description = "Whether to install the final ${displayName} package.";
    };

    package = packageOption;

    ${useSystemOption} = mkOption {
      type = types.bool;
      default = true;
      description = "Whether to use the system ${modName} package instead of the bundled one.";
    };

    configDir = mkOption {
      type = types.path;
      description = "Config directory for ${displayName}.";
    };

    settings = mkOption {
      type = types.attrsOf jsonFormat.type;
      default = { };
      description = "Settings to be placed in ${displayName}'s settings.json.";
    };

    state = mkOption {
      type = types.attrsOf jsonFormat.type;
      default = { };
      description = "State to be placed in ${displayName}'s state.json.";
    };

    autoscroll.enable = mkEnableOption "middle-click autoscrolling for ${displayName}";
  };
}
