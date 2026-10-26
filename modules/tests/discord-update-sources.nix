{ pkgs }:

pkgs.runCommand "discord-update-sources-check"
  {
    nativeBuildInputs = [
      pkgs.bash
      pkgs.jq
      pkgs.coreutils
    ];
  }
  ''
    bash ${./scripts/test-discord-update-sources.sh} \
      ${../../pkgs/discord/sources/update/main.sh}
    touch "$out"
  ''
