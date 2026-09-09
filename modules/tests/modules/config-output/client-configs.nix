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
      vesktopJson = testLib.output.homeFileSource config "${cfg.vesktop.configDir}/settings/settings.json";
      equibopJson = testLib.output.homeFileSource config "${cfg.equibop.configDir}/settings/settings.json";
      vencordPluginKey = pluginJsonKey config firstVencordOnly;
      equicordPluginKey = pluginJsonKey config firstEquicordOnly;
    in
    ''
      ${testLib.output.json vesktopJson ".plugins[${builtins.toJSON vencordPluginKey}].enabled == true and (.plugins | has(${builtins.toJSON equicordPluginKey}) | not) "}
      ${testLib.output.json equibopJson ".plugins[${builtins.toJSON equicordPluginKey}].enabled == true and (.plugins | has(${builtins.toJSON vencordPluginKey}) | not) "}
    '';

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
      vesktopJson = testLib.output.homeFileSource config "${cfg.vesktop.configDir}/settings/settings.json";
      equibopJson = testLib.output.homeFileSource config "${cfg.equibop.configDir}/settings/settings.json";
    in
    ''
      ${testLib.output.json vesktopJson ".frameless == false"}
      ${testLib.output.json equibopJson ".frameless == true"}
    '';

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
      settingsJson = testLib.output.homeActivationSource config "nixcord-vencord-settings";
    in
    ''
      ${testLib.output.json settingsJson ''
        .plugins.MyPlugin.enabled == true
        and .plugins.MyPlugin.newSetting == "renamed"
        and .plugins.MyPlugin.CUSTOM_FLAG == true
        and .plugins.lowerThing.enabled == true
      ''}
    '';

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
      read = testLib.output.homeFileSource config;
    in
    ''
      ${testLib.output.json (read "${cfg.vesktop.configDir}/settings.json") ''.regressionClient == "vesktop"''}
      ${testLib.output.json (read "${cfg.vesktop.configDir}/state.json") ".regressionState == 1"}
      ${testLib.output.json (read "${cfg.equibop.configDir}/settings.json") ''.regressionClient == "equibop"''}
      ${testLib.output.json (read "${cfg.equibop.configDir}/state.json") ".regressionState == 2"}
    '';

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
