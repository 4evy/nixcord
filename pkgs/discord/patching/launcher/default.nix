{
  lib,
  bun,
  callPackage,
  writeShellApplication,
}:
let
  tools = callPackage ../. { };
in
writeShellApplication {
  name = "patch-discord-launcher";
  text = ''
    exec ${lib.getExe bun} ${tools.scriptSource}/launcher/main.ts \
      ${tools}/node_modules/typescript/dist/api/async/api.js "$@"
  '';
}
