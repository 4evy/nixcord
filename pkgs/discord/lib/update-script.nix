{
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
  runtimeEnv = {
    DISCORD_UPDATE_SOURCES_PY = updateSourcesPy;
  };
  runtimeInputs = [
    cacert
    nix
    curl
    jq
    python3
  ];
  text = ''
    # shellcheck disable=SC1091
    source ${../scripts/update-sources.sh}
  '';
}
