{ pkgs }:

let
  discordAvailable = pkgs.lib.meta.availableOn pkgs.stdenv.hostPlatform pkgs.discord;
  discordPackage = pkgs.callPackage ../../pkgs/discord { };

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
pkgs.runCommand "discord-package-arguments-test" { nativeBuildInputs = [ pkgs.nix ]; } ''
  ${
    if !discordAvailable || pkgs.lib.lists.all pkgs.lib.trivial.id (builtins.attrValues tests) then
      "echo 'Discord package capability checks passed'"
    else
      "exit 1"
  }
  ${pkgs.lib.strings.optionalString (discordAvailable && pkgs.stdenv.hostPlatform.isDarwin) ''
    ${pkgs.jq}/bin/jq -e '.disableUpdater == true' \
      '${discordPackage}/Applications/Discord.app/Contents/Resources/build_info.json'
    echo 'Darwin native module updater is disabled'
  ''}
  ${pkgs.lib.strings.optionalString discordAvailable ''
    export NIX_STATE_DIR="$TMPDIR/nix-state"
    export NIX_REMOTE=dummy://
    mkdir -p "$NIX_STATE_DIR"
    evaluate() {
      nix-instantiate --eval --strict --expr "
        let pkgs = import ${pkgs.path} {
          system = \"${pkgs.stdenv.hostPlatform.system}\";
          config.allowUnfree = true;
        };
        in (pkgs.callPackage ${../../pkgs/discord} { $1 }).name
      "
    }
    # A nearby valid package must evaluate, so unrelated evaluation failures
    # cannot satisfy the negative cases.
    evaluate 'withVencord = false; withEquicord = false; branch = "stable";' > /dev/null
    expect_error() {
      if evaluate "$1" >actual.out 2>actual.err; then
        echo "Expected package evaluation to fail: $1" >&2
        exit 1
      fi
      grep -F -- "$2" actual.err
    }
    expect_error 'withVencord = true; withEquicord = true;' \
      'nixcord Discord: Vencord and Equicord cannot both be enabled'
    expect_error 'branch = "unknown";' \
      "nixcord Discord: branch 'unknown' is unavailable on this platform"
  ''}
  touch "$out"
''
