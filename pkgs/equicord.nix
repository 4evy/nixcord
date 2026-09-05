{
  equicord,
  fetchFromGitHub,
  fetchPnpmDeps,
  buildWebExtension ? false,
  bun,
  callPackage,
  writeShellApplication,
  cacert,
  curl,
  jq,
  nix,
  nix-prefetch-github,
  replaceVars,
}:
let
  version = "1.15.4.0-2026-09-03";
  rev = "b90a13be8e0636837e9bfdc8f18cc40cf8190962";
  hash = "sha256-Bu1226PDuCmY8w7RKTMZJzsLQiF0URuABZGxgo78H7k=";
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
  updateScript = writeShellApplication {
    name = "equicord-update";
    runtimeInputs = [
      bun
      cacert
      curl
      jq
      nix
      nix-prefetch-github
    ];
    text = ''
      # shellcheck disable=SC1091
      source ${
        replaceVars ./scripts/update-vencord-family.sh {
          clientName = "Equicord";
          nixFile = "./pkgs/equicord.nix";
          inherit (equicord.src) owner repo;
          versionVar = "version";
          hashVar = "hash";
          revVar = "rev";
          pnpmHashVar = "pnpmDepsHash";
          callPackageArgs = "{ }";
          branch = "main";
          dependencyName = "equicord";
        }
      } "$@"
    '';
  };
in
(equicord.override { inherit buildWebExtension; }).overrideAttrs (
  oldAttrs:
  let
    pnpm = callPackage ./pnpm.nix { };
    patches = (oldAttrs.patches or [ ]) ++ [
      ./patches/equicord-content-warning-settings.patch
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
