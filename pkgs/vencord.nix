{
  fetchFromGitHub,
  fetchPnpmDeps,
  vencord,
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
  version = "1.14.16-2026-07-20";
  rev = "4b9c27d905d6255141617546227a56073916ebd4";
  hash = "sha256-dhBD/xlgf0VXVEP6I5kB6wmyJz7k8Epy1m8mHKhZuqs=";
  pnpmDepsHash = "sha256-JmTSfUVHsMG0TcOwXkZWinRxpONZagtwKzESd8Q4LlQ=";
  src = fetchFromGitHub {
    inherit (vencord.src) owner repo;
    inherit rev hash;
  };
in
(vencord.override { inherit buildWebExtension; }).overrideAttrs (
  oldAttrs:
  let
    pnpm = pnpm_11;
    patches = [ ];
    postPatch = "";
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
      inherit
        pnpm
        patches
        postPatch
        src
        ;
      prePnpmInstall = ''
        export NODE_OPTIONS=--max-old-space-size=2048
        export pnpm_config_child_concurrency=1
        export pnpm_config_network_concurrency=1
        export pnpm_config_workspace_concurrency=1
      '';
      fetcherVersion = 4;
      hash = pnpmDepsHash;
    };
    env = (oldAttrs.env or { }) // {
      VENCORD_REMOTE = "${src.owner}/${src.repo}";
      VENCORD_HASH = rev;
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
              inherit (vencord.src) owner repo;
              versionVar = "version";
              hashVar = "hash";
              revVar = "rev";
              pnpmHashVar = "pnpmDepsHash";
              callPackageArgs = "{ }";
              branch = "main";
              dependencyName = "vencord";
            }
          } "$@"
        '';
      };
    };
    nativeBuildInputs =
      builtins.filter (input: (input.pname or "") != "pnpm") (oldAttrs.nativeBuildInputs or [ ])
      ++ [ pnpm ];
  }
)
