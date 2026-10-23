{
  writeShellApplication,
  cacert,
  coreutils,
  curl,
  jq,
  branch,
}:
writeShellApplication {
  name = "discord-update";
  runtimeInputs = [
    coreutils
    curl
    jq
  ];
  runtimeEnv = {
    DISCORD_BRANCHES = branch;
    SSL_CERT_FILE = "${cacert}/etc/ssl/certs/ca-bundle.crt";
  };
  text = builtins.readFile ./main.sh;
}
