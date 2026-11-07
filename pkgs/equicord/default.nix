{
  lib,
  callPackage,
  fetchFromGitHub,
  buildWebExtension ? false,
}:
let
  buildClientMod = callPackage ../build-client-mod/build-client-mod.nix { };
  version = "2026-11-07-unstable-2026-11-06";
  rev = "cb95617b390c52addac1ab456388ead3fd2dbe11";
  hash = "sha256-y48T5X5sMvGDU3Wp7+5U2kQcBacbeTQMJ4FryXJDe6w=";
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
