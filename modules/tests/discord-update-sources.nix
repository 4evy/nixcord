{ pkgs }:

pkgs.runCommand "discord-update-sources-check"
  {
    nativeBuildInputs = [ pkgs.python3 ];
  }
  ''
    python3 ${./scripts/test-discord-update-sources.py} \
      ${../../pkgs/discord/scripts/update-sources.py}
    touch "$out"
  ''
