{ pkgs }:

let
  testLib = import ./lib { inherit pkgs; };
  inherit (testLib) lib;

  config = testLib.eval.nixos {
    enable = true;
    discord.vencord.enable = true;
  };

  generatedScript = config.system.activationScripts.nixcord-writeFiles.text;
  harmlessScript =
    builtins.replaceStrings
      [
        (lib.getExe' pkgs.coreutils "id")
        (lib.getExe' pkgs.coreutils "install")
      ]
      [
        (lib.getExe' pkgs.coreutils "true")
        (lib.getExe' pkgs.coreutils "true")
      ]
      generatedScript;
in
pkgs.runCommand "nixos-activation-safety-test" { } ''
  # NixOS activation deliberately runs without these options so that its ERR
  # trap can record a failed snippet and continue finalizing the generation.
  set +e
  set +u
  set +o pipefail

  ${harmlessScript}

  case "$-" in
    *e*) echo "Nixcord leaked errexit into the shared activation shell" >&2; exit 1 ;;
  esac
  case "$-" in
    *u*) echo "Nixcord leaked nounset into the shared activation shell" >&2; exit 1 ;;
  esac
  if shopt -qo pipefail; then
    echo "Nixcord leaked pipefail into the shared activation shell" >&2
    exit 1
  fi

  # Model an unrelated, later activation snippet failing. The shared shell
  # must continue so NixOS can finish activation and update /run/current-system.
  false
  touch "$out"
''
