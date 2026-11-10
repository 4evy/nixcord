{
  lib,
  callPackage,
  fetchFromGitHub,
  buildWebExtension ? false,
}:
let
  buildClientMod = callPackage ../build-client-mod/build-client-mod.nix { };
  version = "1.15.17-unstable-2026-11-10";
  rev = "795ed0ff5b7e6b8db7488d0fcc95512a58edc919";
  hash = "sha256-+dN4wAFNmYVDiEe0QStqrFBRFHBBRkApqbmhuvsLZZM=";
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
