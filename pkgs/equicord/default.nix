{
  lib,
  callPackage,
  fetchFromGitHub,
  buildWebExtension ? false,
}:
let
  buildClientMod = callPackage ../build-client-mod/build-client-mod.nix { };
  version = "2026-10-08-unstable-2026-10-30";
  rev = "8d0ebf3549890be2ecb1e1d602b1695f584c71cc";
  hash = "sha256-ijNxC/uR3Wy4JX/6qNnNGQwS5752+vK2T26N1bsLeG4=";
  bunDepsHash = "sha256-MSSV+SR5qDYA61E2Qb5fFPMJT1rZQie1g4PQykqtfzI=";
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
