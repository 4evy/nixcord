{
  equicord,
  fetchFromGitHub,
  fetchPnpmDeps,
  stdenvNoCC,
  buildWebExtension ? false,
  bun,
  writeShellApplication,
  cacert,
  curl,
  jq,
  nix,
  nix-prefetch-github,
  replaceVars,
}:
let
  version = "1.14.15.1-unstable-2026-07-08";
  rev = "5acf0141bf4e20cb0244ce122a92fc6df03b6e71";
  hash = "sha256-6K/8G2FgMIF8VwcXzJuM51tVdB2q+H9sSNMpsbbl1m8=";
  pnpmDepsHashDarwin = "sha256-UiatcvcmMkegod1QGSyfKV3Gp/pP612pHEDmkgq6uS0=";
  pnpmDepsHashLinux = "sha256-UiatcvcmMkegod1QGSyfKV3Gp/pP612pHEDmkgq6uS0=";
  pnpmDepsHash = if stdenvNoCC.isDarwin then pnpmDepsHashDarwin else pnpmDepsHashLinux;
  owner = equicord.src.owner;
  repo = equicord.src.repo;
  src = fetchFromGitHub {
    inherit owner repo;
    inherit rev hash;
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
          owner = equicord.src.owner;
          repo = equicord.src.repo;
          updateKind = "unstable-branch";
          versionVar = "version";
          hashVar = "hash";
          revVar = "rev";
          pnpmHashVar = "";
          callPackageArgs = "{ }";
          stableTagRegex = "^v[0-9]+\\.[0-9]+\\.[0-9]+(\\.[0-9]+)?$";
          branch = "main";
          versionPrefixMode = "keep-v";
          skipIfCurrent = "true";
          dependencyName = "equicord";
        }
      } "$@"
    '';
  };
in
(equicord.override { inherit buildWebExtension; }).overrideAttrs (
  oldAttrs:
  let
    patches = (oldAttrs.patches or [ ]) ++ [
      ./patches/equicord-pnpm-lock-pnpm10.patch
      ./patches/equicord-content-warning-settings.patch
    ];
  in
  {
    inherit version src;
    inherit patches;
    pnpmDeps = fetchPnpmDeps {
      inherit src;
      inherit version;
      inherit patches;
      inherit (oldAttrs) pname;
      inherit (oldAttrs.pnpmDeps) pnpm fetcherVersion;
      hash = pnpmDepsHash;
    };
    passthru = (oldAttrs.passthru or { }) // {
      inherit updateScript;
    };
    env = {
      EQUICORD_REMOTE = "${owner}/${repo}";
      EQUICORD_HASH = "${rev}";
    };
  }
)
