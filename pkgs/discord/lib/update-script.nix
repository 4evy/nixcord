{
  lib,
  writeShellApplication,
  cacert,
  nix,
  curl,
  jq,
  python3,
  updateSourcesPy,
}:
writeShellApplication {
  name = "discord-update";
  runtimeInputs = [
    cacert
    nix
    curl
    jq
    python3
  ];
  text = ''
    set -a
    ${lib.toShellVars {
      DISCORD_UPDATE_SOURCES_PY = updateSourcesPy;
    }}
    set +a
    # shellcheck disable=SC1091
    source ${../scripts/update-sources.sh}
  '';
}
