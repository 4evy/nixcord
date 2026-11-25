{
  lib,
  callPackage,
  fetchFromGitHub,
  buildWebExtension ? false,
}:
let
  buildClientMod = callPackage ../build-client-mod/build-client-mod.nix { };
  version = "1.15.19-unstable-2026-11-24";
  rev = "d086992fb674299a2fa05ac6432edc3a777389f3";
  hash = "sha256-rQhEICRWSRe72EQFq1WZ95/0Nim3dG2wSkVIeR28bSY=";
  bunDepsHash = "sha256-yFwPl8fcKGfSKGKehIpyYyG8dB+Uwys7bag/2JCgjJU=";
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
