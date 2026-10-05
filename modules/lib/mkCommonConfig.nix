# Build packages, settings, and file specifications for all platform modules.
{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.nixcord;

  inherit (import ./. { inherit lib; })
    applyPostPatch
    mkBrowserBuild
    mkIsQuickCssUsed
    mkPluginKit
    mkDorionConfigAttrs
    mkSettingsFiles
    mkThemeFile
    mkConfigDirs
    mkAllFullConfigs
    mkInstalledPackages
    mkFileSpecs
    mkCopyCommands
    ;

  inherit (cfg) parseRules;

  inherit (pkgs.callPackage ./core.nix { inherit lib parseRules; }) mkVencordCfg mkFinalPackages;

  pluginKit = mkPluginKit cfg;

  fullConfigs = mkAllFullConfigs cfg pluginKit;

  inherit (fullConfigs)
    vencordFullConfig
    equicordFullConfig
    vesktopFullConfig
    equibopFullConfig
    goofcordFullConfig
    ;

  vencord = applyPostPatch {
    inherit cfg;
    pkg = cfg.discord.vencord.package;
  };

  equicord = applyPostPatch {
    inherit cfg;
    pkg = cfg.discord.equicord.package;
  };

  isQuickCssUsed = mkIsQuickCssUsed cfg;

  jsonFormat = pkgs.formats.json { };

  quickCss = pkgs.writeText "quickcss.css" cfg.quickCss;

  settings = mkSettingsFiles {
    inherit
      pkgs
      cfg
      mkVencordCfg
      vencordFullConfig
      equicordFullConfig
      vesktopFullConfig
      equibopFullConfig
      ;
  };

  themes = lib.attrsets.mapAttrs (mkThemeFile { inherit pkgs; }) cfg.config.themes;

  dorionAttrs = mkDorionConfigAttrs cfg;

  dorionConfig =
    if cfg.dorion.enable then jsonFormat.generate "dorion-config.json" dorionAttrs else null;

  legcordWeb = lib.attrsets.genAttrs [ "vencord" "equicord" ] (
    client:
    if cfg.legcord.enable && cfg.legcord.${client}.enable then
      import ./legcord.nix { inherit lib pkgs; } {
        inherit client themes;
        browserBuild = mkBrowserBuild { inherit cfg client; };
        settings = mkVencordCfg (
          pluginKit.mkFullConfig {
            inherit client;
            inherit (cfg) extraConfig;
            baseConfig = cfg.config;
          }
        );
        inherit (cfg) quickCss;
      }
    else
      null
  );

  # Bundled Legcord mods must use the Nix-built files and skip bundle updates.
  legcordAttrs =
    let
      inherit (cfg) legcord;
      bundledMods =
        lib.lists.optional legcord.vencord.enable "vencord"
        ++ lib.lists.optional legcord.equicord.enable "equicord";
      autoSettings = lib.attrsets.optionalAttrs (bundledMods != [ ]) (
        lib.attrsets.genAttrs [ "mods" "noBundleUpdates" ] (
          name: lib.lists.unique ((legcord.settings.${name} or [ ]) ++ bundledMods)
        )
      );
    in
    legcord.settings // autoSettings // { doneSetup = true; };

  legcordSettings =
    if cfg.legcord.enable then jsonFormat.generate "legcord-config.json" legcordAttrs else null;

  goofcordCanUseSystemMod = cfg.goofcord.enable && cfg.goofcord.package != null;

  goofcordBrowserBuild =
    if goofcordCanUseSystemMod then
      mkBrowserBuild {
        inherit cfg;
        client = cfg.goofcord.clientMod;
      }
    else
      null;

  goofcordModSettings = builtins.toJSON (mkVencordCfg goofcordFullConfig);

  goofcordSettingsBootstrapText = ''
    ;localStorage.setItem(
      ${
        builtins.toJSON (
          if cfg.goofcord.clientMod == "vencord" then "VencordSettings" else "EquicordSettings"
        )
      },
      ${builtins.toJSON goofcordModSettings}
    );
  '';

  goofcordSettingsBootstrap = pkgs.writeText "goofcord-settings-bootstrap.js" goofcordSettingsBootstrapText;

  enabledGoofcordThemePaths = lib.trivial.pipe (goofcordFullConfig.enabledThemes or [ ]) [
    (map (lib.strings.removeSuffix ".css"))
    (lib.lists.filter (name: builtins.hasAttr name themes))
    (map (name: themes.${name}))
  ];

  goofcordThemeSeparator = pkgs.writeText "goofcord-theme-separator" "\n";

  goofcordThemes =
    if enabledGoofcordThemePaths == [ ] then
      pkgs.writeText "goofcord-themes.css" ""
    else
      pkgs.concatText "goofcord-themes.css" (
        lib.strings.intersperse goofcordThemeSeparator enabledGoofcordThemePaths
      );

  goofcordQuickCss =
    if isQuickCssUsed cfg.goofcordConfig then quickCss else pkgs.writeText "goofcord-quickcss.css" "";

  finalPackages = mkFinalPackages {
    inherit
      cfg
      vencord
      equicord
      goofcordBrowserBuild
      goofcordSettingsBootstrap
      goofcordQuickCss
      goofcordThemes
      ;
  };

  goofcordSupport =
    if goofcordCanUseSystemMod then "${finalPackages.goofcord}/share/goofcord" else null;

  goofcordManagedAssetFiles = [
    "PreVencord.js"
    "PostVencord.js"
    "ClientMod.js"
    "ClientModStyles.css"
    "QuickCSS.css"
    "Themes.css"
  ];

  # Track previous names so GoofCord removes old copies before loading assets
  goofcordManagedFiles =
    goofcordManagedAssetFiles
    ++ map (name: "Nixcord${name}") goofcordManagedAssetFiles
    ++ [
      "Vencord.js"
      "VencordStyles.css"
      "Equicord.js"
      "EquicordStyles.css"
    ];

  goofcordSettingsAssets =
    if builtins.isAttrs (cfg.goofcord.settings.assets or { }) then
      cfg.goofcord.settings.assets or { }
    else
      { };

  goofcordAttrs =
    cfg.goofcord.settings
    // lib.attrsets.optionalAttrs cfg.goofcord.autoscroll.enable { autoscroll = true; }
    // {
      assets =
        goofcordSettingsAssets
        // cfg.goofcord.extraAssets
        // lib.attrsets.optionalAttrs (goofcordSupport != null) {
          PreVencord = "${goofcordSupport}/preVencord.js";
          PostVencord = "${goofcordSupport}/postVencord.js";
          ClientMod = "${goofcordSupport}/clientMod.js";
          ClientModStyles = "${goofcordSupport}/clientMod.css";
          QuickCSS = "${goofcordSupport}/quickCss.css";
          Themes = "${goofcordSupport}/themes.css";
        };
      managedFiles = goofcordManagedFiles;
    };

  goofcordSettings =
    if goofcordSupport != null then
      jsonFormat.generate "goofcord-settings.json" goofcordAttrs
    else
      null;

  packages = {
    inherit vencord equicord;
    final = finalPackages;
    installed = mkInstalledPackages cfg finalPackages;
  };

  configs = fullConfigs // {
    inherit
      dorionAttrs
      legcordAttrs
      goofcordAttrs
      goofcordModSettings
      goofcordSettingsBootstrapText
      ;
  };

  files = {
    inherit
      settings
      themes
      quickCss
      dorionConfig
      legcordSettings
      legcordWeb
      goofcordSettings
      goofcordSupport
      goofcordQuickCss
      goofcordThemes
      ;
  };

  mkActivationScripts =
    wrapScript:
    import ./activation.nix {
      inherit
        lib
        pkgs
        cfg
        mkVencordCfg
        wrapScript
        ;
    };

  fileSpecs = mkFileSpecs {
    inherit
      cfg
      files
      isQuickCssUsed
      ;
  };

  fileCopyCommands = mkCopyCommands fileSpecs;
in
{
  inherit
    cfg
    packages
    configs
    files
    mkVencordCfg
    isQuickCssUsed
    mkConfigDirs
    mkActivationScripts
    fileSpecs
    fileCopyCommands
    ;
}
