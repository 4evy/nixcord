{
  lib,
  fetchzip,
  writeShellApplication,
  nodejs,
}:
let
  # TypeScript 7 has no compatible compiler API; the stock bundle patcher
  # uses the latest 6.x API independently of the repository's native tsc CLI
  typescript = fetchzip {
    name = "typescript-6.0.3";
    url = "https://registry.npmjs.org/typescript/-/typescript-6.0.3.tgz";
    hash = "sha256-3+cPVJRyySKkVrRsOld6ShMzHwOP7UFFy0mrq3ZoBKA=";
  };
in
writeShellApplication {
  name = "patch-discord-updater";
  text = ''
    exec ${lib.meta.getExe nodejs} ${./main.cts} \
      ${typescript}/lib/typescript.js "$@"
  '';
}
