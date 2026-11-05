{
  lib,
  callPackage,
  fetchFromGitHub,
  buildWebExtension ? false,
}:
let
  buildClientMod = callPackage ../build-client-mod/build-client-mod.nix { };
  version = "2026-11-05-unstable-2026-11-05";
  rev = "54704591b4b5dbfc5e5cca9ff38241bc8115cbee";
  hash = "sha256-poye0GWfucn/NsSuAmkXjJVP7qOc2g6n9KQWUFQVzak=";
  bunDepsHash = "sha256-LTQS7WktqVUjfkkPuuqNhppEocxVwu7FrmU9Ztp9HUU=";
  src = fetchFromGitHub {
    owner = "Equicord";
    repo = "Equicord";
    inherit rev hash;
  };
  patches = [ ./equicord-content-warning-settings.patch ];
in
buildClientMod {
  pname = "equicord";
  inherit
    version
    src
    patches
    bunDepsHash
    buildWebExtension
    ;
  bunLock = ./bun.lock;
  # Upstream nests browser artifacts alongside the desktop build
  browserDir = "dist/browser";
  env = {
    EQUICORD_REMOTE = "${src.owner}/${src.repo}";
    EQUICORD_HASH = rev;
  };
  meta = {
    description = if buildWebExtension then "Equicord web extension" else "Equicord Discord client mod";
    homepage = "https://github.com/Equicord/Equicord";
    license = lib.licenses.gpl3Only;
    platforms = lib.platforms.unix;
  };
}
