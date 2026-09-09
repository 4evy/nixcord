{ pkgs }:
let
  testLib = import ./lib { inherit pkgs; };
  disabled = {
    enable = false;
    discord.vencord.enable = true;
    vesktop.enable = true;
    quickCss = "body {}";
    config.plugins.alwaysAnimate.enable = true;
  };
  quiet = config: config.assertions == [ ] && config.warnings == [ ];
  systemEmpty =
    config:
    quiet config && config.environment.systemPackages == [ ] && config.system.activationScripts == { };
  hm = testLib.eval.hm disabled;
in
testLib.run.tests "disabled-module-output" {
  "Home Manager contributes no outputs when disabled" =
    quiet hm && hm.home.packages == [ ] && hm.home.file == { } && hm.home.activation == { };
  "NixOS contributes no outputs when disabled" = systemEmpty (testLib.eval.nixos disabled);
  "nix-darwin contributes no outputs when disabled" = systemEmpty (testLib.eval.darwin disabled);
}
