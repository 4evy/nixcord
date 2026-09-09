{
  equicord,
  fetchFromGitHub,
  fetchPnpmDeps,
  buildWebExtension ? false,
  callPackage,
  nix-update-script,
}:
let
  version = "1.15.4.0-2026-09-05";
  rev = "3b617d4f02be78808dfbfc1b192e1fd20fe5db00";
  hash = "sha256-ueea3PGBVLjnpMxzQ1dmEuLq9Hj6zF3o+ODT7eD+1To=";
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
  updateScript = nix-update-script {
    attrPath = "equicord";
    extraArgs = [
      "--flake"
      "--version=branch=main"
      "--override-filename=pkgs/equicord/default.nix"
    ];
  };
in
(equicord.override { inherit buildWebExtension; }).overrideAttrs (
  oldAttrs:
  let
    pnpm = callPackage ../pnpm { };
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
    nativeBuildInputs =
      builtins.filter (input: (input.pname or "") != "pnpm") (oldAttrs.nativeBuildInputs or [ ])
      ++ [ pnpm ];
    passthru = (oldAttrs.passthru or { }) // {
      inherit updateScript;
    };
    env = (oldAttrs.env or { }) // {
      EQUICORD_REMOTE = "${owner}/${repo}";
      EQUICORD_HASH = "${rev}";
    };
  }
)
