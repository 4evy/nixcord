{ lib, ... }:
let
  inherit (import ./discord.nix { inherit lib; }) branchDirName getPrimaryDiscordBranch;

  # Read only defined option values so absent upstream settings stay absent
  configFromOptions =
    include: opts:
    lib.attrsets.concatMapAttrs (
      name: option:
      if lib.options.isOption option then
        lib.attrsets.optionalAttrs (option.isDefined && include option) { ${name} = option.value; }
      else
        lib.attrsets.filterAttrs (_: value: value != { }) {
          ${name} = configFromOptions include option;
        }
    ) opts;

  mkIsQuickCssUsed =
    cfg: appConfig:
    let
      appQuickCss = builtins.isAttrs appConfig && (appConfig.useQuickCss or false);
    in
    (cfg.config.useQuickCss || appQuickCss) && cfg.quickCss != "";

  inherit (import ./normalization/casing.nix { inherit lib; }) toSnakeCase;

  mkDorionConfigAttrs =
    cfg:
    lib.trivial.pipe cfg.dorion [
      (
        attrs:
        lib.attrsets.removeAttrs attrs [
          "enable"
          "installPackage"
          "package"
          "configDir"
          "extraSettings"
        ]
      )
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
    configFromOptions
    mkIsQuickCssUsed
    toSnakeCase
    mkDorionConfigAttrs
    mkConfigDirs
    mkAllFullConfigs
    ;
}
