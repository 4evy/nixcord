{ testLib }:

let
  common = import ./common.nix { inherit testLib; };
  inherit (common) vesktopBaseConfig recursiveUpdate;
in
{
  "vesktop themes produce css files" =
    let
      config = testLib.eval.hm (
        recursiveUpdate vesktopBaseConfig {
          config.themes.myTheme = "body { background: black; }";
        }
      );
    in
    testLib.output.text (testLib.output.homeFileSource config "/home/testuser/.config/vesktop/themes/myTheme.css") "body { background: black; }";

  "equibop themes produce css files" =
    let
      config = testLib.eval.hm {
        enable = true;
        discord.enable = false;
        equibop.enable = true;
        equibop.configDir = "/home/testuser/.config/equibop";
        config.themes.myTheme = "body { background: black; }";
      };
    in
    testLib.output.text (testLib.output.homeFileSource config "/home/testuser/.config/equibop/themes/myTheme.css") "body { background: black; }";
}
