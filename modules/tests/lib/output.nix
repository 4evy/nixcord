{ lib }:

let
  fileSpecBy =
    config: predicate: description:
    let
      matches = lib.filter predicate config._nixcordTest.common.fileSpecs;
    in
    if matches == [ ] then
      throw "missing generated file spec for ${description}"
    else
      builtins.head matches;

  generatedFileText =
    config: spec:
    let
      inherit (config._nixcordTest) common;
      inherit (common)
        cfg
        configs
        mkVencordCfg
        ;
      toVencordJSON = value: builtins.toJSON (mkVencordCfg value);
      disabledUpdateSettings = {
        SKIP_HOST_UPDATE = true;
        SKIP_MODULE_UPDATE = true;
        USE_NEW_UPDATER = false;
      };
      themeName = lib.pipe spec.name [
        (lib.removePrefix "vesktop-theme-")
        (lib.removePrefix "equibop-theme-")
      ];
      theme = cfg.config.themes.${themeName};
    in
    if spec.name == "vencord-settings" then
      toVencordJSON configs.vencordFullConfig
    else if spec.name == "equicord-settings" then
      toVencordJSON configs.equicordFullConfig
    else if spec.name == "discord-settings" then
      toVencordJSON (cfg.discord.settings // disabledUpdateSettings)
    else if spec.name == "vesktop-settings" then
      toVencordJSON configs.vesktopFullConfig
    else if spec.name == "vesktop-client-settings" then
      toVencordJSON cfg.vesktop.settings
    else if spec.name == "vesktop-state" then
      toVencordJSON cfg.vesktop.state
    else if spec.name == "equibop-settings" then
      toVencordJSON configs.equibopFullConfig
    else if spec.name == "equibop-client-settings" then
      toVencordJSON cfg.equibop.settings
    else if spec.name == "equibop-state" then
      toVencordJSON cfg.equibop.state
    else if spec.name == "dorion-config" then
      builtins.unsafeDiscardStringContext (builtins.toJSON configs.dorionAttrs)
    else if spec.name == "legcord-settings" then
      builtins.toJSON configs.legcordAttrs
    else if lib.hasSuffix "quick-css" spec.name then
      cfg.quickCss
    else if lib.hasPrefix "vesktop-theme-" spec.name || lib.hasPrefix "equibop-theme-" spec.name then
      if builtins.isPath theme || lib.isStorePath theme then builtins.readFile theme else theme
    else
      throw "generated file spec ${spec.name} is not text-backed in tests";

  homeFileText =
    config: path: generatedFileText config (fileSpecBy config (spec: spec.dest == path) path);
in
{
  inherit homeFileText;

  homeFileJSON = config: path: builtins.fromJSON (homeFileText config path);

  homeActivationInstallJSON =
    config: activationName:
    builtins.fromJSON (
      generatedFileText config (
        fileSpecBy config (
          spec: spec.name == lib.removePrefix "nixcord-" activationName
        ) "activation ${activationName}"
      )
    );

}
