{
  fetchFromGitHub,
  fetchPnpmDeps,
  vencord,
  buildWebExtension ? false,
  callPackage,
}:
let
  pnpm = callPackage ../pnpm { };
  version = "1.15.7-2026-09-25";
  rev = "a9d7a2243b3433e25951ad0bca9cc693349ab3c1";
  hash = "sha256-Ioj8Ng5dpO54R298LUZ1EB91PTESIWKlWPn3B/cKNrg=";
  pnpmDepsHash = "sha256-LiAcWwGmZlpO+rr0tcMNpViBiBRhSHj+wvyHFIe32lw=";
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
        updateScript = callPackage ../plugin-update.nix { } {
          attrPath = "vencord";
          filename = "pkgs/vencord/default.nix";
        };
      };
    }
  )
