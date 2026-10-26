{
  lib,
  callPackage,
  fetchFromGitHub,
  buildWebExtension ? false,
}:
let
  buildClientMod = callPackage ../build-client-mod/build-client-mod.nix { };
  version = "1.15.13.0-2026-10-25";
  rev = "762c38c7d18d0271bcbec763880980814d9b74c6";
  hash = "sha256-tNDfbq1jWW9mpHY2psUkomTApp7A1sBKvZHx7YWWKd4=";
  bunDepsHash = "sha256-Tz7g5Dnx1pNQwZV6dVjEt1rYeafJV8bAXoJibBgj4/A=";
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
