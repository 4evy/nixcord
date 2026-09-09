{ lib, ... }:
let
  inherit (import ./discord.nix { inherit lib; }) branchDirName getPrimaryDiscordBranch;

  mkIsQuickCssUsed =
    cfg: appConfig:
    let
      appQuickCss = builtins.isAttrs appConfig && (appConfig.useQuickCss or false);
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
    discord.configDir = lib.modules.mkDefault "${
      lib.trivial.defaultTo basePath (cfg.discord.appDataDir or null)
    }/${branchDirName.${getPrimaryDiscordBranch cfg}}";
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
    lib.attrsets.mapAttrs'
      (
        name: client:
        lib.attrsets.nameValuePair "${name}FullConfig" (
          pluginKit.mkFullConfig {
            inherit client;
            inherit (cfg) extraConfig;
            baseConfig = cfg.config;
            clientConfig = cfg.${name + "Config"};
          }
        )
      )
      {
        vencord = null;
        equicord = null;
        vesktop = "vencord";
        equibop = "equicord";
        goofcord = cfg.goofcord.clientMod;
      };

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
