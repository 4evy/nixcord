# Shared validation: warnings for deprecated/renamed plugins and assertions
# for mutually-exclusive client options.
{
  config,
  lib,
  options,
  ...
}:
let
  cfg = config.programs.nixcord;

  inherit (import ./lib/shared.nix { inherit lib; })
    mkPluginKit
    mkAssertions
    ;

  pluginKit = mkPluginKit { inherit cfg; };

  inherit (pluginKit)
    pluginNameMigrations
    collectDeprecatedPlugins
    collectEnabledEquicordOnlyPlugins
    collectEnabledVencordOnlyPlugins
    ;

  isOption = value: builtins.isAttrs value && (value._type or null) == "option";

  oldPluginEnableWasDefined =
    oldName:
    let
      oldEnableOption = options.programs.nixcord.config.plugins.${oldName}.enable or null;
    in
    isOption oldEnableOption && oldEnableOption.isDefined;

  oldPluginIsEnabled = oldName: cfg.config.plugins.${oldName}.enable or false;

  deprecatedTypedPlugins = lib.filter (
    oldName: oldPluginIsEnabled oldName && oldPluginEnableWasDefined oldName
  ) (builtins.attrNames pluginNameMigrations);

  freeformPlugins = {
    plugins =
      (cfg.extraConfig.plugins or { })
      // (cfg.vencordConfig.plugins or { })
      // (cfg.equicordConfig.plugins or { })
      // (cfg.vesktopConfig.plugins or { })
      // (cfg.equibopConfig.plugins or { });
  };

  deprecatedFreeformPlugins = lib.filter (oldName: !(builtins.elem oldName deprecatedTypedPlugins)) (
    collectDeprecatedPlugins freeformPlugins
  );

  deprecatedPlugins = deprecatedTypedPlugins ++ deprecatedFreeformPlugins;

  deprecatedPluginsSorted = lib.filter (oldName: builtins.elem oldName deprecatedPlugins) (
    builtins.attrNames pluginNameMigrations
  );

  generateMigrationWarning =
    oldName:
    let
      newName = pluginNameMigrations.${oldName} or null;
    in
    if newName != null then
      "'${oldName}' has been renamed to '${newName}'. The old name will continue to work for now but will be removed in a future update. Please update your config to use '${newName}'."
    else
      "'${oldName}' is deprecated. Please check the documentation for the new name";
in
{
  config = lib.mkIf cfg.enable {
    warnings = lib.map generateMigrationWarning deprecatedPluginsSorted;

    assertions = mkAssertions {
      inherit cfg collectEnabledEquicordOnlyPlugins collectEnabledVencordOnlyPlugins;
    };
  };
}
