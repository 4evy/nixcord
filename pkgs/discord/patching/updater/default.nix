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
  name = "patch-discord-updater";
  text = ''
    exec ${lib.meta.getExe nodejs} ${../.}/updater/main.cts \
      ${tools}/node_modules/ts-morph/dist/ts-morph.js "$@"
  '';
}
