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

  jsonFormat = pkgs.formats.json { };

  packageOption =
    lib.options.mkPackageOption pkgs displayName {
      default = moduleName;
      nullable = nullPackageOnDarwin;
    }
    // lib.attrsets.optionalAttrs nullPackageOnDarwin {
      default = if pkgs.stdenvNoCC.hostPlatform.isDarwin then null else pkgs.${moduleName} or null;
      defaultText = lib.options.literalExpression "if pkgs.stdenvNoCC.hostPlatform.isDarwin then null else pkgs.${moduleName} or null";
    };
in
{
  options.programs.nixcord.${moduleName} = {
    enable = lib.options.mkEnableOption displayName;

    installPackage = lib.options.mkOption {
      type = lib.types.bool;
      default = true;
      description = "Whether to install the final ${displayName} package.";
    };

    package = packageOption;

    ${useSystemOption} = lib.options.mkOption {
      type = lib.types.bool;
      default = true;
      description = "Whether to use the system ${modName} package instead of the bundled one.";
    };

    configDir = lib.options.mkOption {
      type = lib.types.path;
      description = "Config directory for ${displayName}.";
    };

    settings = lib.options.mkOption {
      type = lib.types.attrsOf jsonFormat.type;
      default = { };
      description = "Settings to be placed in ${displayName}'s settings.json.";
    };

    state = lib.options.mkOption {
      type = lib.types.attrsOf jsonFormat.type;
      default = { };
      description = "State to be placed in ${displayName}'s state.json.";
    };

    autoscroll.enable = lib.options.mkEnableOption "middle-click autoscrolling for ${displayName}";
  };
}
