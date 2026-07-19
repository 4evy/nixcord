{ testLib }:

let
  inherit (testLib.fixtures.plugins) firstEquicordOnly firstVencordOnly;
  pluginJsonKey =
    config: pluginName:
    builtins.head (
      builtins.attrNames
        (config._nixcordTest.common.mkVencordCfg {
          plugins.${pluginName}.enable = true;
        }).plugins
    );
in
{
  "desktop clients receive only compatible typed plugins" =
    let
      config = testLib.eval.hm {
        enable = true;
        discord.enable = false;
        vesktop.enable = true;
        equibop.enable = true;
        config.plugins = {
          ${firstVencordOnly}.enable = true;
          ${firstEquicordOnly}.enable = true;
        };
      };
      cfg = config.programs.nixcord;
      vesktopJson = testLib.output.homeFileJSON config "${cfg.vesktop.configDir}/settings/settings.json";
      equibopJson = testLib.output.homeFileJSON config "${cfg.equibop.configDir}/settings/settings.json";
      vencordPluginKey = pluginJsonKey config firstVencordOnly;
      equicordPluginKey = pluginJsonKey config firstEquicordOnly;
    in
    assert vesktopJson.plugins.${vencordPluginKey}.enabled == true;
    assert !(builtins.hasAttr equicordPluginKey vesktopJson.plugins);
    assert equibopJson.plugins.${equicordPluginKey}.enabled == true;
    assert !(builtins.hasAttr vencordPluginKey equibopJson.plugins);
    true;

  "global and client config merge in documented precedence order" =
    let
      config = testLib.eval.hm {
        enable = true;
        discord.enable = false;
        vesktop.enable = true;
        equibop.enable = true;
        config.frameless = false;
        extraConfig.frameless = true;
        vesktopConfig.frameless = false;
      };
      cfg = config.programs.nixcord;
      vesktopJson = testLib.output.homeFileJSON config "${cfg.vesktop.configDir}/settings/settings.json";
      equibopJson = testLib.output.homeFileJSON config "${cfg.equibop.configDir}/settings/settings.json";
    in
    assert vesktopJson.frameless == false;
    assert equibopJson.frameless == true;
    true;

  "custom parse rules affect generated plugin and setting names" =
    let
      config = testLib.eval.hm {
        enable = true;
        discord.vencord.enable = true;
        parseRules = {
          upperNames = [ "customFlag" ];
          lowerPluginTitles = [ "lowerThing" ];
          pluginRenames.customPlugin = "MyPlugin";
          settingRenames.customPlugin.oldSetting = "newSetting";
        };
        extraConfig.plugins = {
          customPlugin = {
            enable = true;
            oldSetting = "renamed";
            customFlag = true;
          };
          lowerThing.enable = true;
        };
      };
      settingsJson = testLib.output.homeActivationInstallJSON config "nixcord-vencord-settings";
    in
    assert settingsJson.plugins.MyPlugin.enabled == true;
    assert settingsJson.plugins.MyPlugin.newSetting == "renamed";
    assert settingsJson.plugins.MyPlugin.CUSTOM_FLAG == true;
    assert settingsJson.plugins.lowerThing.enabled == true;
    true;

  "desktop client settings and state keep their values separate" =
    let
      config = testLib.eval.hm {
        enable = true;
        discord.enable = false;
        vesktop = {
          enable = true;
          settings.regressionClient = "vesktop";
          state.regressionState = 1;
        };
        equibop = {
          enable = true;
          settings.regressionClient = "equibop";
          state.regressionState = 2;
        };
      };
      cfg = config.programs.nixcord;
      read = testLib.output.homeFileJSON config;
    in
    assert (read "${cfg.vesktop.configDir}/settings.json").regressionClient == "vesktop";
    assert (read "${cfg.vesktop.configDir}/state.json").regressionState == 1;
    assert (read "${cfg.equibop.configDir}/settings.json").regressionClient == "equibop";
    assert (read "${cfg.equibop.configDir}/state.json").regressionState == 2;
    true;

  "empty desktop client settings and state do not create files" =
    let
      config = testLib.eval.hm {
        enable = true;
        discord.enable = false;
        vesktop.enable = true;
        equibop.enable = true;
      };
      cfg = config.programs.nixcord;
    in
    assert !(builtins.hasAttr "${cfg.vesktop.configDir}/settings.json" config.home.file);
    assert !(builtins.hasAttr "${cfg.vesktop.configDir}/state.json" config.home.file);
    assert !(builtins.hasAttr "${cfg.equibop.configDir}/settings.json" config.home.file);
    assert !(builtins.hasAttr "${cfg.equibop.configDir}/state.json" config.home.file);
    true;
}
