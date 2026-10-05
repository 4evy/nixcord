{ pkgs }:

pkgs.runCommand "discord-update-sources-check"
  {
    nativeBuildInputs = [ pkgs.python3 ];
  }
  ''
    python3 ${./scripts/test-discord-update-sources.py} \
      ${../../pkgs/discord/sources/update/main.py}
    touch "$out"
  ''
