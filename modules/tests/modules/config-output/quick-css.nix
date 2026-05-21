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
      (builtins.getAttr "/home/testuser/.config/Vencord/settings/quickCss.css" config.home.file).text
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
}
