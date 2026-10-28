{
  lib,
  callPackage,
  fetchFromGitHub,
  buildWebExtension ? false,
}:
let
  buildClientMod = callPackage ../build-client-mod/build-client-mod.nix { };
  version = "2026-10-08-unstable-2026-10-28";
  rev = "a5753f70a1e4ccde881ea516a5d1b2fc51cadd86";
  hash = "sha256-YzIqDTrjkuqDw1Op95hGqv4cEV5FluGxlin/KgCEBcM=";
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
