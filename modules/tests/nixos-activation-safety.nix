{ pkgs }:

let
  testLib = import ./lib { inherit pkgs; };
  inherit (testLib) lib;

  config = testLib.eval.nixos {
    enable = true;
    discord.vencord.enable = true;
  };

  generatedScript = config.system.activationScripts.writeDiscordClientFiles.text;
  activationNames = [
    "disableDiscordUpdates"
    "fixDiscordModules"
    "writeDiscordClientFiles"
  ];
  activationsRunAfterUsers = lib.lists.all (
    name: builtins.elem "users" config.system.activationScripts.${name}.deps
  ) activationNames;
  harmlessScript =
    builtins.replaceStrings
      [
        (lib.meta.getExe' pkgs.coreutils "id")
        (lib.meta.getExe' pkgs.coreutils "install")
      ]
      [
        (lib.meta.getExe' pkgs.coreutils "true")
        (lib.meta.getExe' pkgs.coreutils "true")
      ]
      generatedScript;
in
assert activationsRunAfterUsers;
pkgs.runCommand "nixos-activation-safety-test" { } ''
  # NixOS activation deliberately runs without these options so that its ERR
  # trap can record a failed snippet and continue finalizing the generation.
  set +e
  set +u
  set +o pipefail

  ${harmlessScript}

  case "$-" in
    *e*) echo "Client activation leaked errexit into the shared activation shell" >&2; exit 1 ;;
  esac
  case "$-" in
    *u*) echo "Client activation leaked nounset into the shared activation shell" >&2; exit 1 ;;
  esac
  if shopt -qo pipefail; then
    echo "Client activation leaked pipefail into the shared activation shell" >&2
    exit 1
  fi

  # Model an unrelated, later activation snippet failing. The shared shell
  # must continue so NixOS can finish activation and update /run/current-system.
  false
  touch "$out"
''
