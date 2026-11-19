{
  lib,
  callPackage,
  fetchFromGitHub,
  buildWebExtension ? false,
}:
let
  buildClientMod = callPackage ../build-client-mod/build-client-mod.nix { };
  version = "1.15.18-unstable-2026-11-19";
  rev = "a846785482f96c50f1160a04217e1e90283d2ec1";
  hash = "sha256-nLcTPhPZQI2wPDM9WLTNsIJcMxmBbe4Xp/3P9+ok4Z0=";
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
