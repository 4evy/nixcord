{
  lib,
  callPackage,
  fetchFromGitHub,
  buildWebExtension ? false,
}:
let
  buildClientMod = callPackage ../build-client-mod/build-client-mod.nix { };
  version = "2026-11-10-unstable-2026-11-10";
  rev = "32b337cd098bc9ad782250810be8eb570e28ef2f";
  hash = "sha256-yREhzm+HDSi9ZXepZmJy7zC5ZKfXUp5iUQga9XjLZ7k=";
  bunDepsHash = "sha256-mwaA1pyXAGrlxLNGV5lCtvBRIYJbPXsMHPqmd3uQs9s=";
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
