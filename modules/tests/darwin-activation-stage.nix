{ pkgs }:

let
  testLib = import ./lib { inherit pkgs; };
  config = testLib.eval.darwin {
    enable = true;
    discord.vencord.enable = true;
    dorion.enable = true;
  };
  inherit (config.system) activationScripts;
  applications = activationScripts.applications.text;
in
testLib.run.tests "darwin-activation-stage-test" {
  "Discord activation runs in nix-darwin's applications stage" =
    testLib.lib.hasInfix "SKIP_HOST_UPDATE" applications
    && testLib.lib.hasInfix "discord-development" applications
    && testLib.lib.hasInfix "sudo --user=testuser" applications;

  "Dorion activation runs in nix-darwin's applications stage" =
    testLib.lib.hasInfix "VencordSettings" applications;

  "Nixcord does not create activation stages ignored by nix-darwin" =
    !(activationScripts ? nixcord-disableDiscordUpdates)
    && !(activationScripts ? nixcord-fixDiscordModules)
    && !(activationScripts ? nixcord-setupDorionVencordSettings);
}
