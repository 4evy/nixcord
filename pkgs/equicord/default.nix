{
  lib,
  equicord,
  fetchFromGitHub,
  fetchPnpmDeps,
  buildWebExtension ? false,
  callPackage,
}:
let
  pnpm = callPackage ../pnpm { };
  pnpmArgument =
    if lib.trivial.functionArgs equicord.override ? pnpm_10_latest then "pnpm_10_latest" else "pnpm_10";
  fetchDeps = callPackage ../pnpm/fetch-deps.nix { inherit fetchPnpmDeps; };
  version = "1.15.10.0-2026-10-09";
  rev = "51eab49cce4566e51f65f29cc0eaae50efdd48d4";
  hash = "sha256-x1tpRKmhO8JBjAwhNYqVdvMvKapv6pde9nN/6IS50Vw=";
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
  ${pnpmArgument} = pnpm;
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
