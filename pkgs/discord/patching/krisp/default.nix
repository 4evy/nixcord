{
  lib,
  bun,
  callPackage,
  writeShellApplication,
}:
let
  tools = callPackage ../. { };
  patcher =
    mode:
    writeShellApplication {
      name = "patch-krisp-${mode}";
      text = ''
        exec ${lib.getExe bun} ${tools.scriptSource}/krisp/main.ts \
            ${tools}/node_modules/typescript/dist/api/async/api.js ${mode} "$@"
      '';
    };
in
{
  voice = patcher "voice";
  index = patcher "index";
}
