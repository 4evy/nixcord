# Shared validation: warnings for deprecated/renamed plugins and assertions
# for mutually-exclusive client options.
{
  config,
  lib,
  options,
  pkgs,
  ...
}:
let
  cfg = config.programs.nixcord;

  inherit (import ./lib/shared.nix { inherit lib; })
    isPluginEnabled
    mkPluginKit
    mkAssertions
    ;

  pluginKit = mkPluginKit cfg;

  inherit (pluginKit)
    pluginNameMigrations
    mergePlugins
    collectDeprecatedPlugins
    ;

  pluginsOptions = options.programs.nixcord.config.plugins;
  configuredPlugins = cfg.config.plugins;

  oldPluginEnableWasDefined =
    oldName:
    let
      oldEnableOption = pluginsOptions.${oldName}.enable or null;
    in
    lib.options.isOption oldEnableOption && oldEnableOption.isDefined;

  oldPluginIsEnabled = oldName: isPluginEnabled (configuredPlugins.${oldName} or null);

  deprecatedTypedPlugins = lib.trivial.pipe pluginNameMigrations [
    (lib.attrsets.filterAttrs (
      oldName: _: oldPluginIsEnabled oldName && oldPluginEnableWasDefined oldName
    ))
    lib.attrsets.attrNames
  ];

  freeformPlugins = {
    plugins = mergePlugins [
      cfg.extraConfig
      cfg.vencordConfig
      cfg.equicordConfig
      cfg.vesktopConfig
      cfg.equibopConfig
    ];
  };

  deprecatedPluginsSorted = builtins.attrNames (
    lib.attrsets.genAttrs (deprecatedTypedPlugins ++ collectDeprecatedPlugins freeformPlugins) (_: null)
  );

  discordHasNoModClient =
    cfg.discord.enable
    && !cfg.discord.vencord.enable
    && !cfg.discord.equicord.enable
    && !cfg.discord.silenceNoModClientWarning;

  inherit (import ./lib/discord.nix { inherit lib; })
    branchDirName
    getPrimaryDiscordBranch
    getDiscordConfigDirs
    packageSupportsOverride
    ;
  discordKrispUnsupported =
    cfg.discord.enable
    && cfg.discord.krisp.enable
    && !(packageSupportsOverride cfg.discord.package "withKrisp");

  discordConfigDirs = getDiscordConfigDirs cfg;
  discordConfigDirsAreUnique = lib.lists.allUnique discordConfigDirs;

  generateMigrationWarning =
    oldName:
    let
      newName = pluginNameMigrations.${oldName};
    in
    "'${oldName}' has been renamed to '${newName}'. The old name will continue to work for now but will be removed in a future update. Please update your config to use '${newName}'.";
in
{
  config = lib.modules.mkIf cfg.enable {
    warnings =
      lib.lists.map generateMigrationWarning deprecatedPluginsSorted
      ++ lib.lists.optional discordHasNoModClient ''
        programs.nixcord.discord.vencord.enable and programs.nixcord.discord.equicord.enable are both disabled. Discord will be installed without Vencord or Equicord.
        To acknowledge and silence this warning, set programs.nixcord.discord.silenceNoModClientWarning to true.
      ''
      ++ lib.lists.optional discordKrispUnsupported ''
        programs.nixcord.discord.krisp.enable is enabled, but the selected Discord package does not expose nixcord's withKrisp patch override. Krisp patching will be skipped for this package.
      '';

    assertions = mkAssertions cfg pluginKit ++ [
      {
        assertion =
          !cfg.discord.enable
          || cfg.discord.appDataDir == null
          || (
            pkgs.stdenvNoCC.hostPlatform.isDarwin && packageSupportsOverride cfg.discord.package "appDataDir"
          );
        message = "programs.nixcord.discord.appDataDir requires Nixcord's Discord package on macOS.";
      }
      {
        assertion =
          !cfg.discord.enable
          || !pkgs.stdenvNoCC.hostPlatform.isDarwin
          || !(packageSupportsOverride cfg.discord.package "appDataDir")
          ||
            builtins.baseNameOf (toString cfg.discord.configDir)
            == branchDirName.${getPrimaryDiscordBranch cfg};
        message = "programs.nixcord.discord.configDir must end with the primary Discord branch's directory name on macOS; set discord.appDataDir to change its parent directory.";
      }
      {
        assertion = !cfg.discord.enable || discordConfigDirsAreUnique;
        message = ''
          programs.nixcord.discord.branches resolve multiple branches to the same Discord config directory: ${lib.strings.concatStringsSep ", " discordConfigDirs}. Set programs.nixcord.discord.configDir to a directory for the first branch that does not overlap another branch's standard directory.
        '';
      }
    ];
  };
}
