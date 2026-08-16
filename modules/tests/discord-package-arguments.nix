{ pkgs }:

let
  discordAvailable = pkgs.lib.meta.availableOn pkgs.stdenv.hostPlatform pkgs.discord;

  packageEvaluationFails =
    args: package: !(builtins.tryEval (pkgs.callPackage package args).drvPath).success;

  fhsCapableDiscord = pkgs.lib.customisation.makeOverridable (
    {
      source ? null,
      withVencord ? false,
      withEquicord ? false,
      withOpenASAR ? false,
      commandLineArgs ? "",
      vencord ? null,
      equicord ? null,
      openasar ? null,
      useFHSEnv ? true,
    }:
    pkgs.runCommand "nixcord-fhs-capable-discord-stub" {
      passthru = {
        nixcordTestUseFHSEnv = useFHSEnv;
        disableBreakingUpdates = pkgs.writeShellScriptBin "disable-breaking-updates.py" "exit 0";
      };
    } "mkdir -p $out"
  ) { };

  tests = {
    "direct package use rejects mutually exclusive mods" = packageEvaluationFails {
      withVencord = true;
      withEquicord = true;
    } ../../pkgs/discord;

    "direct package use rejects unknown branches" = packageEvaluationFails {
      branch = "unknown";
    } ../../pkgs/discord;

    "FHS-capable upstream is forced to its non-FHS package" =
      let
        package = pkgs.callPackage ../../pkgs/discord {
          discord = fhsCapableDiscord;
          withKrisp = false;
        };
      in
      !pkgs.stdenv.hostPlatform.isLinux || (!package.nixcordTestUseFHSEnv && !package.nixcordUsesFHSEnv);

    "Krisp patch stays enabled on the non-FHS package" =
      (pkgs.callPackage ../../pkgs/discord { withKrisp = true; }).nixcordKrispPatch;
  };
in
pkgs.runCommand "discord-package-arguments-test" { } ''
  ${
    if !discordAvailable || pkgs.lib.lists.all pkgs.lib.trivial.id (builtins.attrValues tests) then
      "echo '4 discord package argument tests passed'"
    else
      "exit 1"
  }
  touch "$out"
''
