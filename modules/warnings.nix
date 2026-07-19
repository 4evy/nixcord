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

  inherit (import ./lib/shared.nix { inherit lib; }) mkPluginKit mkAssertions;

  pluginKit = mkPluginKit cfg;

  inherit (pluginKit)
    pluginNameMigrations
    mergePlugins
    collectDeprecatedPlugins
    collectEnabledEquicordOnlyPlugins
    collectEnabledVencordOnlyPlugins
    ;

  isOption = value: builtins.isAttrs value && (value._type or null) == "option";

  pluginsOptions = options.programs.nixcord.config.plugins;
  configuredPlugins = cfg.config.plugins;

  oldPluginEnableWasDefined =
    oldName:
    let
      oldEnableOption = pluginsOptions.${oldName}.enable or null;
    in
    isOption oldEnableOption && oldEnableOption.isDefined;

  oldPluginIsEnabled =
    oldName:
    let
      plugin = configuredPlugins.${oldName} or null;
    in
    builtins.isAttrs plugin && plugin ? enable && plugin.enable;

  deprecatedTypedPlugins = lib.filter (
    oldName: oldPluginIsEnabled oldName && oldPluginEnableWasDefined oldName
  ) (builtins.attrNames pluginNameMigrations);

  freeformPlugins = {
    plugins = mergePlugins [
      cfg.extraConfig
      cfg.vencordConfig
      cfg.equicordConfig
      cfg.vesktopConfig
      cfg.equibopConfig
    ];
  };

  deprecatedFreeformPlugins = lib.filter (oldName: !(builtins.elem oldName deprecatedTypedPlugins)) (
    collectDeprecatedPlugins freeformPlugins
  );

  deprecatedPlugins = deprecatedTypedPlugins ++ deprecatedFreeformPlugins;

  deprecatedPluginsSorted = lib.filter (oldName: builtins.elem oldName deprecatedPlugins) (
    builtins.attrNames pluginNameMigrations
  );

  autoscrollEnableOption = options.programs.nixcord.discord.autoscroll.enable;
  autoscrollEnableWasDefined = lib.lists.any (
    file: !(builtins.elem file autoscrollEnableOption.declarations)
  ) autoscrollEnableOption.files;

  discordHasNoModClient =
    cfg.discord.enable
    && !cfg.discord.vencord.enable
    && !cfg.discord.equicord.enable
    && !cfg.discord.silenceNoModClientWarning;

  discordOverride = cfg.discord.package.override or null;
  discordOverrideArgs =
    if discordOverride != null && lib.isFunction discordOverride then
      lib.functionArgs discordOverride
    else
      { };
  discordPackageSupports = arg: discordOverrideArgs.${arg} or false;
  discordKrispUnsupported =
    cfg.discord.enable && cfg.discord.krisp.enable && !(discordPackageSupports "withKrisp");

  generateMigrationWarning =
    oldName:
    let
      newName = pluginNameMigrations.${oldName};
    in
    "'${oldName}' has been renamed to '${newName}'. The old name will continue to work for now but will be removed in a future update. Please update your config to use '${newName}'.";
in
{
  config = lib.mkIf cfg.enable {
    warnings =
      lib.lists.map generateMigrationWarning deprecatedPluginsSorted
      ++ lib.lists.optional autoscrollEnableWasDefined ''
        programs.nixcord.discord.autoscroll.enable is deprecated and will be removed in the future. Use `programs.nixcord.discord.commandLineArgs = [ "--enable-blink-features=MiddleClickAutoscroll" ];` instead.
      ''
      ++ lib.lists.optional discordHasNoModClient ''
        programs.nixcord.discord.vencord.enable and programs.nixcord.discord.equicord.enable are both disabled. Discord will be installed without Vencord or Equicord.
        To acknowledge and silence this warning, set programs.nixcord.discord.silenceNoModClientWarning to true.
      ''
      ++ lib.lists.optional discordKrispUnsupported ''
        programs.nixcord.discord.krisp.enable is enabled, but the selected Discord package does not expose nixcord's withKrisp patch override. Krisp patching will be skipped for this package.
      '';

    assertions = mkAssertions {
      inherit
        cfg
        mergePlugins
        collectEnabledEquicordOnlyPlugins
        collectEnabledVencordOnlyPlugins
        ;
    };
  };
}
