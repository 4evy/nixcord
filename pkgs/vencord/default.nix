{
  lib,
  callPackage,
  fetchFromGitHub,
  buildWebExtension ? false,
}:
let
  buildClientMod = callPackage ../build-client-mod/build-client-mod.nix { };
  version = "1.15.12-2026-10-21";
  rev = "b0e636df2ed5c9006b80ddc6644bc41110404bc3";
  hash = "sha256-7UOyztToPBCHQo0lkt4Mr/OTORNRoXnRsWdTSY616Kk=";
  bunDepsHash = "sha256-daNUbnfjfjPYUkI9lw7gu2r3f/59OBBKaXynL31Zr+E=";
  src = fetchFromGitHub {
    owner = "Vendicated";
    repo = "Vencord";
    inherit rev hash;
  };
  patches = [ ];
in
buildClientMod {
  pname = "vencord";
  inherit
    version
    src
    patches
    bunDepsHash
    buildWebExtension
    ;
  bunLock = ./bun.lock;
  env = {
    VENCORD_REMOTE = "${src.owner}/${src.repo}";
    VENCORD_HASH = rev;
  };
  meta = {
    description = if buildWebExtension then "Vencord web extension" else "Vencord Discord client mod";
    homepage = "https://github.com/Vendicated/Vencord";
    license = lib.licenses.gpl3Only;
    platforms = lib.platforms.unix;
  };
}
