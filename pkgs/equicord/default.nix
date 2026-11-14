{
  lib,
  callPackage,
  fetchFromGitHub,
  buildWebExtension ? false,
}:
let
  buildClientMod = callPackage ../build-client-mod/build-client-mod.nix { };
  version = "2026-11-14-unstable-2026-11-14";
  rev = "87dcb6a316a00616a99495f508b11b12b68c064a";
  hash = "sha256-ZpFDQWCdxm8WGxaEhD5QvJlnqtsjoIXV/+PxQ2Qq9M0=";
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
