{
  equicord,
  fetchFromGitHub,
  fetchPnpmDeps,
  buildWebExtension ? false,
  callPackage,
}:
let
  pnpm = callPackage ../pnpm { };
  fetchDeps = callPackage ../pnpm/fetch-deps.nix { inherit fetchPnpmDeps; };
  version = "1.15.9.0-2026-10-03";
  rev = "1489c0e2a4435d854d7343a5cfb0abb894772318";
  hash = "sha256-utAAobxSmcmM8ZiM0y6E5OtvEpKDOtq5eP3KSu22saM=";
  pnpmDepsHash = "sha256-pU/oxNJ9epA75Pth/b7mO67NavS8wy2BI/wuKKgnCpM=";
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
      pnpmDeps = fetchDeps {
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
