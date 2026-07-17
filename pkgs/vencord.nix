{
  fetchFromGitHub,
  fetchPnpmDeps,
  lib,
  vencord,
  buildWebExtension ? false,
  unstable ? false,
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
  stableVersion = "1.14.16-unstable-2026-07-17";
  stableRev = "0a5dfaa1caa0799899b4d14e3862b70c665d8223";
  stableHash = "sha256-5j2BN51toR9ygtcL+DLChTdeGjoVjo8uBNjI86Q2wgY=";
  stablePnpmDeps = "sha256-JmTSfUVHsMG0TcOwXkZWinRxpONZagtwKzESd8Q4LlQ=";

  version = stableVersion;
  hash = stableHash;
  pnpmDepsHash = stablePnpmDeps;
  rev = stableRev;
  usePnpm11 = lib.versionAtLeast version "1.14.15-unstable-2026-07-02";
  src = fetchFromGitHub {
    inherit (vencord.src) owner repo;
    inherit rev hash;
  };
in
(vencord.override { inherit buildWebExtension; }).overrideAttrs (
  oldAttrs:
  let
    pnpm = if usePnpm11 then pnpm_11 else oldAttrs.pnpmDeps.pnpm;
    patches = if usePnpm11 then [ ] else oldAttrs.patches or [ ];
    postPatch = if usePnpm11 then "" else oldAttrs.postPatch or "";
  in
  {
    inherit
      version
      src
      patches
      postPatch
      ;
    pnpmDeps = fetchPnpmDeps {
      inherit (oldAttrs) pname;
      inherit (oldAttrs.pnpmDeps) fetcherVersion;
      inherit pnpm patches postPatch;
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
  }
  // lib.optionalAttrs usePnpm11 {
    nativeBuildInputs =
      builtins.filter (input: (input.pname or "") != "pnpm") (oldAttrs.nativeBuildInputs or [ ])
      ++ [ pnpm ];
  }
)
