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
      description = "Whether to load Nixcord's ${modName} package in place of the client's bundled mod.";
    };

    configDir = lib.options.mkOption {
      type = lib.types.path;
      description = "Directory containing ${displayName}'s client preferences and mod settings.";
    };

    settings = lib.options.mkOption {
      type = lib.types.attrsOf jsonFormat.type;
      default = { };
      description = "Native ${displayName} preferences written to `settings.json`. Put plugin settings in `config.plugins` or `${moduleName}Config.plugins`.";
    };

    state = lib.options.mkOption {
      type = lib.types.attrsOf jsonFormat.type;
      default = { };
      description = "Client state written to ${displayName}'s `state.json`.";
    };

    autoscroll.enable = lib.options.mkEnableOption "middle-click autoscrolling for ${displayName}";
  };
}
