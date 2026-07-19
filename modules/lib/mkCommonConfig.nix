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

  themes = lib.mapAttrs (mkThemeFile { inherit pkgs; }) cfg.config.themes;

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

  legcordSettings =
    if cfg.legcord.enable && legcordAttrs != { } then
      jsonFormat.generate "nixcord-legcord-config.json" legcordAttrs
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
    inherit dorionAttrs legcordAttrs;
  };

  files = {
    inherit
      settings
      themes
      quickCss
      dorionConfig
      legcordSettings
      legcordWeb
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
