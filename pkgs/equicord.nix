{
  equicord,
  fetchFromGitHub,
  fetchPnpmDeps,
  buildWebExtension ? false,
  bun,
  pnpm_11,
  writeShellApplication,
  cacert,
  curl,
  jq,
  nix,
  nix-prefetch-github,
  replaceVars,
}:
let
  version = "1.15.0.1-2026-07-28";
  rev = "88244a36cc07ae114371b7cc96b4e36e426835a3";
  hash = "sha256-K5HVau5wecMBwKBdLq6hOScYH3OziTJ1W3Zp48pqaWc=";
  pnpmDepsHash = "sha256-uGGHln3IRSZIBotzpC6muCpZdCD9M7DaOqN1Y60OtFo=";
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
    pnpm = pnpm_11;
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
