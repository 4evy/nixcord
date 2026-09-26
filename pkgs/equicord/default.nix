{
  equicord,
  fetchFromGitHub,
  fetchPnpmDeps,
  buildWebExtension ? false,
  callPackage,
}:
let
  pnpm = callPackage ../pnpm { };
  version = "1.15.7.0-2026-09-26";
  rev = "c507c762b696b90a946df57f30f63ff68da6b03f";
  hash = "sha256-3yttd3/AfdAG95ywTCFT/VSRavj/BzLRhIvjuCDPQTI=";
  pnpmDepsHash = "sha256-hBZHHB5kRkNqep5vWMMnwIblNCAOZvLotDjJUJd9iMU=";
  inherit (equicord.src) owner repo;
  src = fetchFromGitHub {
    inherit
      owner
      repo
      rev
      hash
      ;
  };
  updateScript = callPackage ../plugin-update.nix { } {
    attrPath = "equicord";
    filename = "pkgs/equicord/default.nix";
  };
in
(equicord.override {
  inherit buildWebExtension;
  pnpm_10 = pnpm;
}).overrideAttrs
  (
    oldAttrs:
    let
      patches = (oldAttrs.patches or [ ]) ++ [
        ./equicord-content-warning-settings.patch
      ];
    in
    {
      inherit version src patches;
      pnpmDeps = fetchPnpmDeps {
        inherit
          src
          version
          patches
          pnpm
          ;
        inherit (oldAttrs) pname;
        prePnpmInstall = ''
          export NODE_OPTIONS=--max-old-space-size=2048
          export pnpm_config_child_concurrency=1
          export pnpm_config_network_concurrency=1
          export pnpm_config_workspace_concurrency=1
        '';
        fetcherVersion = 4;
        hash = pnpmDepsHash;
      };
      passthru = (oldAttrs.passthru or { }) // {
        inherit updateScript;
      };
      env = (oldAttrs.env or { }) // {
        EQUICORD_REMOTE = "${owner}/${repo}";
        EQUICORD_HASH = "${rev}";
      };
    }
  )
