{ testLib }:

let
  common = import ./common.nix { inherit testLib; };
  inherit (common) baseConfig recursiveUpdate;
in
{
  "discord mod settings are installed as writable activation files" =
    let
      config = testLib.eval.hm baseConfig;
    in
    assert !(builtins.hasAttr "/home/testuser/.config/Vencord/settings/settings.json" config.home.file);
    assert config.home.activation ? nixcord-vencord-settings;
    true;

  "quickCss creates a css file when enabled and non-empty" =
    let
      config = testLib.eval.hm (
        recursiveUpdate baseConfig {
          config.useQuickCss = true;
          quickCss = "body { color: red; }";
        }
      );
    in
    assert
      testLib.output.homeFileText config "/home/testuser/.config/Vencord/settings/quickCss.css"
      == "body { color: red; }";
    true;

  "quickCss skips the css file when empty" =
    let
      config = testLib.eval.hm (
        recursiveUpdate baseConfig {
          config.useQuickCss = true;
          quickCss = "";
        }
      );
    in
    assert !(builtins.hasAttr "/home/testuser/.config/Vencord/settings/quickCss.css" config.home.file);
    true;

  "client-specific quickCss only creates files for opted-in desktop clients" =
    let
      config = testLib.eval.hm {
        enable = true;
        discord.enable = false;
        vesktop.enable = true;
        equibop.enable = true;
        quickCss = "body { color: purple; }";
        vesktopConfig.useQuickCss = true;
      };
      cfg = config.programs.nixcord;
      vesktopPath = "${cfg.vesktop.configDir}/settings/quickCss.css";
      equibopPath = "${cfg.equibop.configDir}/settings/quickCss.css";
    in
    assert testLib.output.homeFileText config vesktopPath == "body { color: purple; }";
    assert !(builtins.hasAttr equibopPath config.home.file);
    true;

  "Vencord-specific useQuickCss enables Discord quick CSS" =
    let
      config = testLib.eval.hm {
        enable = true;
        discord.vencord.enable = true;
        quickCss = "body { color: green; }";
        vencordConfig.useQuickCss = true;
      };
      path = "${config.programs.nixcord.configDir}/settings/quickCss.css";
    in
    assert testLib.output.homeFileText config path == "body { color: green; }";
    true;
}
