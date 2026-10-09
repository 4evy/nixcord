{
  fetchFromGitHub,
  fetchPnpmDeps,
  vencord,
  buildWebExtension ? false,
  callPackage,
}:
let
  pnpm = callPackage ../pnpm { };
  fetchDeps = callPackage ../pnpm/fetch-deps.nix { inherit fetchPnpmDeps; };
  version = "1.15.11-2026-10-09";
  rev = "16ec4ea838899706019e7f472e45f055070abeb1";
  hash = "sha256-bUbzsfrrOd7uWf1q51EohRelG9jfAoFY20gqcQ+enoE=";
  pnpmDepsHash = "sha256-P1X36dnEDGpLAKzf8PTadrF/UfsFu5rA61byXiJx4wc=";
  src = fetchFromGitHub {
    inherit (vencord.src) owner repo;
    inherit rev hash;
  };
in
(vencord.override {
  inherit buildWebExtension;
  pnpm_11 = pnpm;
}).overrideAttrs
  (
    oldAttrs:
    let
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
      pnpmDeps = fetchDeps {
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
        updateScript = callPackage ../plugin-update.nix { } {
          attrPath = "vencord";
          filename = "pkgs/vencord/default.nix";
        };
      };
    }
  )
