# Computes all shared intermediate values needed by every platform module.
# Returns an attrset of { cfg, mkVencordCfg, mkFinalPackages,
#   vencordFullConfig, equicordFullConfig, vesktopFullConfig, equibopFullConfig,
#   vencord, equicord, isQuickCssUsed, mkDorionConfigAttrs, mkConfigDirs,
#   settingsFiles, vesktopThemes, dorionConfigFile, legcordSettingsFile, quickCssFile }.
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
    ;

  parseRules = cfg.parseRules;

  inherit (pkgs.callPackage ./core.nix { inherit lib parseRules; }) mkVencordCfg mkFinalPackages;

  pluginKit = mkPluginKit { inherit cfg; };

  inherit (mkAllFullConfigs { inherit cfg pluginKit; })
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

  isQuickCssUsed = mkIsQuickCssUsed { inherit cfg; };

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
      jsonFormat.generate "nixcord-dorion-config.json" (mkDorionConfigAttrs {
        inherit cfg;
      })
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
      bundledMods =
        lib.optional cfg.legcord.vencord.enable "vencord"
        ++ lib.optional cfg.legcord.equicord.enable "equicord";
      autoSettings = lib.optionalAttrs (bundledMods != [ ]) {
        mods = lib.unique ((cfg.legcord.settings.mods or [ ]) ++ bundledMods);
        noBundleUpdates = lib.unique ((cfg.legcord.settings.noBundleUpdates or [ ]) ++ bundledMods);
      };
    in
    cfg.legcord.settings // autoSettings // { doneSetup = true; };

  legcordSettingsFile =
    if cfg.legcord.enable && legcordFinalSettings != { } then
      jsonFormat.generate "nixcord-legcord-config.json" legcordFinalSettings
    else
      null;
in
{
  inherit
    cfg
    mkVencordCfg
    mkFinalPackages
    vencordFullConfig
    equicordFullConfig
    vesktopFullConfig
    equibopFullConfig
    vencord
    equicord
    isQuickCssUsed
    mkDorionConfigAttrs
    mkConfigDirs
    settingsFiles
    vesktopThemes
    dorionConfigFile
    legcordSettingsFile
    legcordVencordWeb
    legcordEquicordWeb
    quickCssFile
    ;
}
