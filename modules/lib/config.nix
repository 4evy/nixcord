{ lib, ... }:
let
  mkIsQuickCssUsed =
    cfg: appConfig:
    let
      appQuickCss = builtins.isAttrs appConfig && appConfig ? useQuickCss && appConfig.useQuickCss;
    in
    (cfg.config.useQuickCss || appQuickCss) && cfg.quickCss != "";

  toSnakeCase =
    str:
    lib.pipe str [
      (lib.strings.splitStringBy (_prev: curr: builtins.match "[A-Z]" curr != null) true)
      (lib.filter (part: part != ""))
      (map lib.toLower)
      (lib.concatStringsSep "_")
    ];

  mkDorionConfigAttrs =
    cfg:
    lib.pipe cfg.dorion [
      (attrs: lib.removeAttrs attrs [ "extraSettings" ])
      (lib.mapAttrs' (name: value: lib.nameValuePair (toSnakeCase name) value))
      (attrs: { autoupdate = false; } // attrs)
      (attrs: attrs // cfg.dorion.extraSettings)
    ];

  branchDirName = {
    stable = "discord";
    ptb = "discordptb";
    canary = "discordcanary";
    development = "discorddevelopment";
  };

  mkConfigDirs = cfg: basePath: {
    discord.configDir = lib.mkDefault "${basePath}/${branchDirName.${cfg.discord.branch}}";
    configDir = lib.mkDefault "${basePath}/${
      if cfg.discord.equicord.enable then "Equicord" else "Vencord"
    }";
    vesktop.configDir = lib.mkDefault "${basePath}/vesktop";
    equibop.configDir = lib.mkDefault "${basePath}/equibop";
    dorion.configDir = lib.mkDefault "${basePath}/dorion";
    legcord.configDir = lib.mkDefault "${basePath}/legcord";
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
      };
    in
    lib.mapAttrs (_name: spec: mkFullConfig spec) configSpecs;
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
