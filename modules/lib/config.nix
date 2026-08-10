{ lib, ... }:
let
  inherit (import ./discord.nix { inherit lib; }) branchDirName getPrimaryDiscordBranch;

  mkIsQuickCssUsed =
    cfg: appConfig:
    let
      appQuickCss = builtins.isAttrs appConfig && appConfig ? useQuickCss && appConfig.useQuickCss;
    in
    (cfg.config.useQuickCss || appQuickCss) && cfg.quickCss != "";

  toSnakeCase =
    str:
    lib.trivial.pipe str [
      (lib.strings.splitStringBy (_prev: curr: builtins.match "[A-Z]" curr != null) true)
      (lib.lists.filter (part: part != ""))
      (map lib.strings.toLower)
      (lib.strings.concatStringsSep "_")
    ];

  mkDorionConfigAttrs =
    cfg:
    lib.trivial.pipe cfg.dorion [
      (attrs: lib.attrsets.removeAttrs attrs [ "extraSettings" ])
      (lib.attrsets.mapAttrs' (name: value: lib.attrsets.nameValuePair (toSnakeCase name) value))
      (attrs: { autoupdate = false; } // attrs)
      (attrs: attrs // cfg.dorion.extraSettings)
    ];

  mkConfigDirs = cfg: basePath: {
    discord.configDir = lib.modules.mkDefault "${basePath}/${
      branchDirName.${getPrimaryDiscordBranch cfg}
    }";
    configDir = lib.modules.mkDefault "${basePath}/${
      if cfg.discord.equicord.enable then "Equicord" else "Vencord"
    }";
    vesktop.configDir = lib.modules.mkDefault "${basePath}/vesktop";
    equibop.configDir = lib.modules.mkDefault "${basePath}/equibop";
    goofcord.configDir = lib.modules.mkDefault "${basePath}/goofcord/GoofCord";
    dorion.configDir = lib.modules.mkDefault "${basePath}/dorion";
    legcord.configDir = lib.modules.mkDefault "${basePath}/legcord";
  };

  mkAllFullConfigs =
    cfg: pluginKit:
    let
      inherit (pluginKit) mkFullConfig;
      configSpecs = {
        vencordFullConfig = {
          inherit (cfg) extraConfig;
          baseConfig = cfg.config;
          clientConfig = cfg.vencordConfig;
        };
        equicordFullConfig = {
          inherit (cfg) extraConfig;
          baseConfig = cfg.config;
          clientConfig = cfg.equicordConfig;
        };
        vesktopFullConfig = {
          inherit (cfg) extraConfig;
          baseConfig = cfg.config;
          clientConfig = cfg.vesktopConfig;
          client = "vencord";
        };
        equibopFullConfig = {
          inherit (cfg) extraConfig;
          baseConfig = cfg.config;
          clientConfig = cfg.equibopConfig;
          client = "equicord";
        };
        goofcordFullConfig = {
          inherit (cfg) extraConfig;
          baseConfig = cfg.config;
          clientConfig = cfg.goofcordConfig;
          client = cfg.goofcord.clientMod;
        };
      };
    in
    lib.attrsets.mapAttrs (_name: mkFullConfig) configSpecs;
in
{
  inherit
    mkIsQuickCssUsed
    toSnakeCase
    mkDorionConfigAttrs
    mkConfigDirs
    mkAllFullConfigs
    ;
}
