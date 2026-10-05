{ pkgs }:

let
  discordAvailable = pkgs.lib.meta.availableOn pkgs.stdenv.hostPlatform (
    pkgs.callPackage ../../pkgs/discord/metadata.nix { }
  );
  discordPackage = pkgs.callPackage ../../pkgs/discord { };

in
pkgs.runCommand "discord-package-arguments-test" { nativeBuildInputs = [ pkgs.nix ]; } ''
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
          system = \"''${2:-${pkgs.stdenvNoCC.hostPlatform.system}}\";
          config.allowUnfree = true;
          overlays = [
            (_: _: {
              discord = throw \"upstream Discord must not be used\";
              discord-ptb = throw \"upstream Discord PTB must not be used\";
              discord-canary = throw \"upstream Discord Canary must not be used\";
              discord-development = throw \"upstream Discord Development must not be used\";
              buildFHSEnv = throw \"FHS packaging must not be used\";
            })
          ];
        };
        in (pkgs.callPackage ${../../pkgs/discord} { $1 }).drvPath
      "
    }
    # Valid branches must evaluate before checking argument errors
    for branch in stable ptb canary development; do
      evaluate "branch = \"$branch\";" > /dev/null
    done
    expect_error() {
      if evaluate "$1" "''${3:-${pkgs.stdenvNoCC.hostPlatform.system}}" >actual.out 2>actual.err; then
        echo "Expected package evaluation to fail: $1" >&2
        exit 1
      fi
      grep -F -- "$2" actual.err
    }
    expect_error 'withVencord = true; withEquicord = true;' \
      'Discord: Vencord and Equicord cannot both be enabled'
    expect_error 'branch = "unknown";' \
      "Discord: branch 'unknown' is unavailable on this platform"
    expect_error 'appDataDir = "relative/path";' \
      'Discord: appDataDir must be an absolute Darwin path'
    expect_error 'modDataDir = "relative/path";' \
      'Discord: modDataDir must be an absolute Darwin path'
    expect_error 'withOpenASAR = true; openasar = null;' \
      'Discord: OpenASAR requires an openasar package'
    expect_error "" \
      "Discord: unsupported platform 'aarch64-linux'" \
      aarch64-linux
    ${pkgs.lib.strings.optionalString pkgs.stdenvNoCC.hostPlatform.isLinux ''
      expect_error 'appDataDir = "/tmp/discord";' \
        'Discord: appDataDir must be an absolute Darwin path'
      expect_error 'modDataDir = "/tmp/vencord";' \
        'Discord: modDataDir must be an absolute Darwin path'
    ''}
    ${pkgs.lib.strings.optionalString pkgs.stdenvNoCC.hostPlatform.isDarwin ''
      evaluate 'appDataDir = "/tmp/Discord Data"; modDataDir = "/tmp/Mod Data";' > /dev/null
    ''}
  ''}
  touch "$out"
''
