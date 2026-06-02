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

  parseRules = cfg.parseRules;

  inherit (pkgs.callPackage ./core.nix { inherit lib parseRules; }) mkVencordCfg mkFinalPackages;

  pluginKit = mkPluginKit cfg;

  fullConfigs = mkAllFullConfigs cfg pluginKit;

  inherit (fullConfigs)
    vencordFullConfig
    equicordFullConfig
    vesktopFullConfig
    equibopFullConfig
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

  quickCssFile = pkgs.writeText "nixcord-quickcss.css" cfg.quickCss;

  settingsFiles = mkSettingsFiles {
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

  vesktopThemes = lib.mapAttrs (mkThemeFile { inherit pkgs; }) cfg.config.themes;

  dorionConfigFile =
    if cfg.dorion.enable then
      jsonFormat.generate "nixcord-dorion-config.json" (mkDorionConfigAttrs cfg)
    else
      null;

  legcordVencordWeb =
    if cfg.legcord.enable && cfg.legcord.vencord.enable then
      mkBrowserBuild {
        inherit cfg;
        pkg = cfg.discord.vencord.package;
        browserJsPath = "dist/browser.js";
        browserCssPath = "dist/browser.css";
      }
    else
      null;

  legcordEquicordWeb =
    if cfg.legcord.enable && cfg.legcord.equicord.enable then
      mkBrowserBuild {
        inherit cfg;
        pkg = cfg.discord.equicord.package;
        browserJsPath = "dist/browser/browser.js";
        browserCssPath = "dist/browser/browser.css";
      }
    else
      null;

  # Merge user legcord settings with auto-configured mods and noBundleUpdates.
  legcordFinalSettings =
    let
      inherit (cfg) legcord;
      bundledMods =
        lib.optional legcord.vencord.enable "vencord" ++ lib.optional legcord.equicord.enable "equicord";
      listSettings = {
        mods = legcord.settings.mods or [ ];
        noBundleUpdates = legcord.settings.noBundleUpdates or [ ];
      };
      autoSettings = lib.optionalAttrs (bundledMods != [ ]) {
        mods = lib.unique (listSettings.mods ++ bundledMods);
        noBundleUpdates = lib.unique (listSettings.noBundleUpdates ++ bundledMods);
      };
    in
    legcord.settings // autoSettings // { doneSetup = true; };

  legcordSettingsFile =
    if cfg.legcord.enable && legcordFinalSettings != { } then
      jsonFormat.generate "nixcord-legcord-config.json" legcordFinalSettings
    else
      null;

  finalPackages = mkFinalPackages {
    inherit cfg vencord equicord;
  };

  packages = {
    inherit vencord equicord;
    final = finalPackages;
    installed = mkInstalledPackages cfg finalPackages;
  };

  configs = fullConfigs // {
    dorionAttrs = mkDorionConfigAttrs cfg;
  };

  files = {
    settings = settingsFiles;
    themes = vesktopThemes;
    quickCss = quickCssFile;
    dorionConfig = dorionConfigFile;
    legcordSettings = legcordSettingsFile;
    legcordWeb = {
      vencord = legcordVencordWeb;
      equicord = legcordEquicordWeb;
    };
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

  fileCopyCommands = mkCopyCommands fileSpecArgs;
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
