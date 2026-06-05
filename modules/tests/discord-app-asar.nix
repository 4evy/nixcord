{ pkgs }:

let
  bundle = pkgs.writeTextDir "bundle.js" ''
    exports.USE_NEW_UPDATER=settings?.get("USE_NEW_UPDATER",!1)||"win32"===process.platform||"linux"===process.platform
  '';
in
pkgs.runCommand "discord-app-asar-patch-test"
  {
    nativeBuildInputs = [ pkgs.asar ];
  }
  ''
    mkdir app extracted
    asar pack ${bundle} app/app.asar

    source ${../../pkgs/discord/scripts/patch-discord-app-asar.sh} \
      "$PWD/app" \
      ${pkgs.lib.getExe pkgs.asar}

    asar extract app/app.asar extracted
    grep -F 'exports.USE_NEW_UPDATER=settings?.get("USE_NEW_UPDATER")??("win32"===process.platform||"linux"===process.platform)' \
      extracted/bundle.js

    touch "$out"
  ''
