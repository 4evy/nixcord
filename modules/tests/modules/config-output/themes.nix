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
    assert
      testLib.output.homeFileText config "/home/testuser/.config/vesktop/themes/myTheme.css"
      == "body { background: black; }";
    true;
}
