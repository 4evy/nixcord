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
  name = "patch-discord-updater";
  text = ''
    exec ${lib.meta.getExe bun} ${tools.scriptSource}/updater/main.ts \
      ${tools}/node_modules/typescript/dist/api/async/api.js "$@"
  '';
  passthru.patchVoiceKrisp = (callPackage ../krisp { }).voice;
}
