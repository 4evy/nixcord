{
  lib,
  callPackage,
  writeShellApplication,
  nodejs,
}:
let
  tools = callPackage ../. { };
in
writeShellApplication {
  name = "patch-discord-launcher";
  text = ''
    exec ${lib.getExe nodejs} ${../.}/launcher/main.cts \
      ${tools}/node_modules/ts-morph/dist/ts-morph.js "$@"
  '';
}
