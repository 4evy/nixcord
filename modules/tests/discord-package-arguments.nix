{ pkgs }:

let
  discordAvailable = pkgs.lib.meta.availableOn pkgs.stdenv.hostPlatform pkgs.discord;

  packageEvaluationFails =
    args: package: !(builtins.tryEval (pkgs.callPackage package args).drvPath).success;

  tests = {
    "direct package use rejects mutually exclusive mods" = packageEvaluationFails {
      withVencord = true;
      withEquicord = true;
    } ../../pkgs/discord;

    "direct package use rejects unknown branches" = packageEvaluationFails {
      branch = "unknown";
    } ../../pkgs/discord;
  };
in
pkgs.runCommand "discord-package-arguments-test" { } ''
  ${
    if !discordAvailable || pkgs.lib.all pkgs.lib.id (builtins.attrValues tests) then
      "echo '2 discord package argument tests passed'"
    else
      "exit 1"
  }
  touch "$out"
''
