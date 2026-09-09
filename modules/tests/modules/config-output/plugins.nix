{ testLib }:

let
  common = import ./common.nix { inherit testLib; };
  inherit (common) baseConfig discordModSettingsSource recursiveUpdate;
  inherit (testLib) lib pkgs;
  localPlugin = ../../../../packages/parser/tests/fixtures/equicord/src/plugins/shared-plugin;
  stubEquicordPackage = pkgs.runCommand "nixcord-equicord-stub" { } "mkdir $out" // {
    overrideAttrs =
      f:
      let
        attrs = f {
          postPatch = "";
          postInstall = "";
        };
      in
      pkgs.runCommand "nixcord-equicord-final-stub" { } "mkdir $out" // attrs;
  };
in
{
  "enabled plugin appears in generated settings" =
    let
      config = testLib.eval.hm (
        recursiveUpdate baseConfig {
          config.plugins.alwaysAnimate.enable = true;
        }
      );
      settingsJson = discordModSettingsSource config;
    in
    ''
      ${testLib.output.json settingsJson ".plugins.AlwaysAnimate.enabled == true"}
    '';

  "acronym plugin option emits upstream JSON key" =
    let
      config = testLib.eval.hm (
        recursiveUpdate baseConfig {
          config.plugins.clearUrls.enable = true;
        }
      );
      settingsJson = discordModSettingsSource config;
    in
    ''
      ${testLib.output.json settingsJson ''.plugins.ClearURLs.enabled == true and (.plugins | has("ClearUrls") | not)''}
    '';

  "legacy acronym plugin option still emits upstream JSON key" =
    let
      config = testLib.eval.hm (
        recursiveUpdate baseConfig {
          config.plugins.ClearURLs.enable = true;
        }
      );
      settingsJson = discordModSettingsSource config;
    in
    ''
      ${testLib.output.json settingsJson ''.plugins.ClearURLs.enabled == true and (.plugins | has("ClearUrls") | not)''}
    '';

  "acronym plugin setting option emits upstream JSON key" =
    let
      config = testLib.eval.hm (
        recursiveUpdate baseConfig {
          config.plugins.xsOverlay = {
            enable = true;
            preferUdp = true;
          };
        }
      );
      settingsJson = discordModSettingsSource config;
    in
    ''
      ${testLib.output.json settingsJson ''.plugins.XSOverlay.enabled == true and .plugins.XSOverlay.preferUDP == true and (.plugins.XSOverlay | has("preferUdp") | not)''}
    '';

  "CustomRPC private settings emit upstream JSON keys" =
    let
      config = testLib.eval.hm (
        recursiveUpdate baseConfig {
          config.plugins.customRpc = {
            enable = true;
            appId = "1234567890";
            detailsUrl = "https://example.com/details";
            type = 6;
          };
        }
      );
      settingsJson = discordModSettingsSource config;
    in
    ''
      ${testLib.output.json settingsJson ''
        .plugins.CustomRPC.enabled == true
        and .plugins.CustomRPC.appID == "1234567890"
        and .plugins.CustomRPC.detailsURL == "https://example.com/details"
        and .plugins.CustomRPC.type == 6
        and (.plugins.CustomRPC | has("appId") | not)
        and (.plugins.CustomRPC | has("detailsUrl") | not)
      ''}
    '';

  "disabled plugin appears as disabled in generated settings" =
    let
      config = testLib.eval.hm (
        recursiveUpdate baseConfig {
          config.plugins.alwaysAnimate.enable = false;
        }
      );
      settingsJson = discordModSettingsSource config;
    in
    ''
      ${testLib.output.json settingsJson ".plugins.AlwaysAnimate.enabled == false"}
    '';

  "plugin settings are copied to generated output" =
    let
      config = testLib.eval.hm (
        recursiveUpdate baseConfig {
          config.plugins.vcNarrator = {
            enable = true;
            volume = 0.5;
            joinMessage = "hello {{USER}}";
          };
        }
      );
      settingsJson = discordModSettingsSource config;
    in
    ''
      ${testLib.output.json settingsJson ''.plugins.VcNarrator.enabled == true and .plugins.VcNarrator.volume == 0.5 and .plugins.VcNarrator.joinMessage == "hello {{USER}}"''}
    '';

  "extraConfig is merged into generated output" =
    let
      config = testLib.eval.hm (
        recursiveUpdate baseConfig {
          extraConfig.customSetting = "myValue";
        }
      );
      settingsJson = discordModSettingsSource config;
    in
    ''
      ${testLib.output.json settingsJson ''.customSetting == "myValue"''}
    '';

  "themeLinks are preserved in generated output" =
    let
      config = testLib.eval.hm (
        recursiveUpdate baseConfig {
          config.themeLinks = [ "https://example.com/theme.css" ];
        }
      );
      settingsJson = discordModSettingsSource config;
    in
    ''
      ${testLib.output.json settingsJson ''(.themeLinks | index("https://example.com/theme.css") != null)''}
    '';

  "enabledThemeLinks are preserved in generated output" =
    let
      config = testLib.eval.hm (
        recursiveUpdate baseConfig {
          config.enabledThemeLinks = [ "https://example.com/enabled-theme.css" ];
        }
      );
      settingsJson = discordModSettingsSource config;
    in
    ''
      ${testLib.output.json settingsJson ''(.enabledThemeLinks | index("https://example.com/enabled-theme.css") != null)''}
    '';

  "useQuickCss is renamed for generated output" =
    let
      config = testLib.eval.hm (
        recursiveUpdate baseConfig {
          config.useQuickCss = true;
        }
      );
      settingsJson = discordModSettingsSource config;
    in
    ''
      ${testLib.output.json settingsJson ".useQuickCSS == true"}
    '';

  "plugin UI element settings are copied to generated output" =
    let
      config = testLib.eval.hm (
        recursiveUpdate baseConfig {
          config.uiElements = {
            chatBarButtons.MessageLatency.enable = false;
            chatBarButtons.someCustomButton.enable = false;
            messagePopoverButtons.Translate.enable = true;
          };
        }
      );
      settingsJson = discordModSettingsSource config;
    in
    ''
      ${testLib.output.json settingsJson ".uiElements.chatBarButtons.MessageLatency.enabled == false and .uiElements.chatBarButtons.someCustomButton.enabled == false and .uiElements.messagePopoverButtons.Translate.enabled == true"}
    '';

  "absolute string userPlugins are coerced and copied through the Nix store" =
    let
      config = testLib.eval.hm (
        recursiveUpdate baseConfig {
          discord.vencord.enable = false;
          discord.equicord = {
            enable = true;
            package = stubEquicordPackage;
          };
          userPlugins.BetterAudioDefaults = builtins.unsafeDiscardStringContext (toString localPlugin);
        }
      );
      postPatch = builtins.unsafeDiscardStringContext config._nixcordTest.common.packages.equicord.postPatch;
      storePlugin = builtins.unsafeDiscardStringContext "${localPlugin}";
    in
    assert lib.strings.hasInfix "cp -r ${storePlugin} src/userplugins/BetterAudioDefaults" postPatch;
    assert !(lib.strings.hasInfix (toString localPlugin) postPatch);
    true;

  "package userPlugins are accepted as documented" =
    let
      pluginPackage = pkgs.writeTextDir "index.ts" "export default {};";
      config = testLib.eval.hm (
        recursiveUpdate baseConfig {
          discord.vencord.enable = false;
          discord.equicord = {
            enable = true;
            package = stubEquicordPackage;
          };
          userPlugins.packagedPlugin = pluginPackage;
        }
      );
      postPatch = builtins.unsafeDiscardStringContext config._nixcordTest.common.packages.equicord.postPatch;
      packagePath = builtins.unsafeDiscardStringContext "${pluginPackage}";
    in
    assert lib.strings.hasInfix "cp -r ${packagePath} src/userplugins/packagedPlugin" postPatch;
    true;
}
