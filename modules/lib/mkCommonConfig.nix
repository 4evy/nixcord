# Computes the shared state used by every platform module.
{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.nixcord;

  inherit (import ./shared.nix { inherit lib; })
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

  quickCss = pkgs.writeText "nixcord-quickcss.css" cfg.quickCss;

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
    if cfg.dorion.enable then jsonFormat.generate "nixcord-dorion-config.json" dorionAttrs else null;

  legcordWeb = {
    vencord =
      if cfg.legcord.enable && cfg.legcord.vencord.enable then
        mkBrowserBuild {
          inherit cfg;
          pkg = cfg.discord.vencord.package;
          browserJsPath = "dist/browser.js";
          browserCssPath = "dist/browser.css";
        }
      else
        null;

    equicord =
      if cfg.legcord.enable && cfg.legcord.equicord.enable then
        mkBrowserBuild {
          inherit cfg;
          pkg = cfg.discord.equicord.package;
          browserJsPath = "dist/browser/browser.js";
          browserCssPath = "dist/browser/browser.css";
        }
      else
        null;
  };

  # Merge user legcord settings with auto-configured mods and noBundleUpdates.
  legcordAttrs =
    let
      inherit (cfg) legcord;
      bundledMods =
        lib.lists.optional legcord.vencord.enable "vencord"
        ++ lib.lists.optional legcord.equicord.enable "equicord";
      listSettings = {
        mods = legcord.settings.mods or [ ];
        noBundleUpdates = legcord.settings.noBundleUpdates or [ ];
      };
      autoSettings = lib.attrsets.optionalAttrs (bundledMods != [ ]) {
        mods = lib.lists.unique (listSettings.mods ++ bundledMods);
        noBundleUpdates = lib.lists.unique (listSettings.noBundleUpdates ++ bundledMods);
      };
    in
    legcord.settings // autoSettings // { doneSetup = true; };

  legcordSettings =
    if cfg.legcord.enable && legcordAttrs != { } then
      jsonFormat.generate "nixcord-legcord-config.json" legcordAttrs
    else
      null;

  goofcordCanUseSystemMod = cfg.goofcord.enable && cfg.goofcord.package != null;

  goofcordBrowserBuild =
    if goofcordCanUseSystemMod then
      mkBrowserBuild {
        inherit cfg;
        pkg =
          if cfg.goofcord.clientMod == "vencord" then
            cfg.discord.vencord.package
          else
            cfg.discord.equicord.package;
        browserJsPath =
          if cfg.goofcord.clientMod == "vencord" then "dist/browser.js" else "dist/browser/browser.js";
        browserCssPath =
          if cfg.goofcord.clientMod == "vencord" then "dist/browser.css" else "dist/browser/browser.css";
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

  goofcordSettingsBootstrap = pkgs.writeText "nixcord-goofcord-settings-bootstrap.js" goofcordSettingsBootstrapText;

  enabledGoofcordThemePaths = lib.trivial.pipe (goofcordFullConfig.enabledThemes or [ ]) [
    (map (lib.strings.removeSuffix ".css"))
    (lib.lists.filter (name: builtins.hasAttr name themes))
    (map (name: themes.${name}))
  ];

  goofcordThemeSeparator = pkgs.writeText "nixcord-goofcord-theme-separator" "\n";

  goofcordThemes =
    if enabledGoofcordThemePaths == [ ] then
      pkgs.writeText "nixcord-goofcord-themes.css" ""
    else
      pkgs.concatText "nixcord-goofcord-themes.css" (
        lib.strings.intersperse goofcordThemeSeparator enabledGoofcordThemePaths
      );

  goofcordQuickCss =
    if isQuickCssUsed cfg.goofcordConfig then
      quickCss
    else
      pkgs.writeText "nixcord-goofcord-quickcss.css" "";

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
    if goofcordCanUseSystemMod then "${finalPackages.goofcord}/share/nixcord/goofcord" else null;

  goofcordManagedFiles = [
    # Assets managed by this module.
    "NixcordPreVencord.js"
    "NixcordPostVencord.js"
    "NixcordClientMod.js"
    "NixcordClientModStyles.css"
    "NixcordQuickCSS.css"
    "NixcordThemes.css"

    # GoofCord's default asset names. Seeding these into managedFiles lets its
    # asset manager remove stale downloads when adopting an existing profile.
    "PreVencord.js"
    "PostVencord.js"
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
          NixcordPreVencord = "${goofcordSupport}/preVencord.js";
          NixcordPostVencord = "${goofcordSupport}/postVencord.js";
          NixcordClientMod = "${goofcordSupport}/clientMod.js";
          NixcordClientModStyles = "${goofcordSupport}/clientMod.css";
          NixcordQuickCSS = "${goofcordSupport}/quickCss.css";
          NixcordThemes = "${goofcordSupport}/themes.css";
        };
      managedFiles = goofcordManagedFiles;
    };

  goofcordSettings =
    if goofcordSupport != null then
      jsonFormat.generate "nixcord-goofcord-settings.json" goofcordAttrs
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

  fileSpecArgs = {
    inherit
      cfg
      files
      isQuickCssUsed
      ;
  };

  fileSpecs = mkFileSpecs fileSpecArgs;

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
