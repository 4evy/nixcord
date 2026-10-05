{
  writeShellApplication,
  cacert,
  python3,
}:
writeShellApplication {
  name = "discord-update";
  runtimeEnv = {
    DISCORD_UPDATE_SOURCES_PY = ./main.py;
    SSL_CERT_FILE = "${cacert}/etc/ssl/certs/ca-bundle.crt";
  };
  runtimeInputs = [
    cacert
    python3
  ];
  text = ''
    # shellcheck disable=SC1091
    source ${./run.sh}
  '';
}
