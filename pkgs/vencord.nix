{
  fetchFromGitHub,
  fetchPnpmDeps,
  lib,
  vencord,
  buildWebExtension ? false,
  unstable ? false,
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
  stableVersion = "1.14.15-unstable-2026-06-24";
  stableRev = "70d41b0584d8e8b094cbaa771b170dc6e7cf68b3";
  stableHash = "sha256-jQeLZa1rpKDkzWSpAqOa8snGRKLpv9xf9cwJ6hUwMzA=";
  stablePnpmDeps = "sha256-hk1rnNog5xvuIVI0M1ZJ5xrEuk0zcBiYsbROUycdi+A=";

  version = stableVersion;
  hash = stableHash;
  pnpmDepsHash = stablePnpmDeps;
  rev = stableRev;
  src = fetchFromGitHub {
    inherit (vencord.src) owner repo;
    inherit rev hash;
  };
in
(vencord.override { inherit buildWebExtension; }).overrideAttrs (oldAttrs: {
  inherit version src;
  pnpmDeps = fetchPnpmDeps {
    inherit (oldAttrs) pname patches postPatch;
    inherit (oldAttrs.pnpmDeps) pnpm fetcherVersion;
    inherit src;
    hash = pnpmDepsHash;
  };
  meta = oldAttrs.meta // {
    description =
      if buildWebExtension then
        "Vencord web extension"
      else
        oldAttrs.meta.description or "Vencord Discord client mod";
  };
  passthru = (oldAttrs.passthru or { }) // {
    updateScript = writeShellApplication {
      name = "vencord-update";
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
            clientName = "Vencord";
            nixFile = "./pkgs/vencord.nix";
            owner = vencord.src.owner;
            repo = vencord.src.repo;
            updateKind = "unstable-branch";
            versionVar = "stableVersion";
            hashVar = "stableHash";
            revVar = "stableRev";
            pnpmHashVar = "stablePnpmDeps";
            callPackageArgs = "{ }";
            stableTagRegex = "^v[0-9]+\\.[0-9]+\\.[0-9]+$";
            branch = "main";
            versionPrefixMode = "strip-v";
            skipIfCurrent = "false";
            dependencyName = "vencord";
          }
        } "$@"
      '';
    };
  };
})
