{
  lib,
  callPackage,
  fetchFromGitHub,
  buildWebExtension ? false,
}:
let
  buildClientMod = callPackage ../build-client-mod/build-client-mod.nix { };
  version = "1.15.14-unstable-2026-10-29";
  rev = "644434941b515a2626a2161e219653cb36e723e7";
  hash = "sha256-9tyzJnhLHJ6CHB6G3TcvcsyfxRQzcjELBMF337UnbUU=";
  bunDepsHash = "sha256-M1ODUNKxOfm+J9pWv0klmENJQqbbBU1H590LdOyIGDE=";
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
