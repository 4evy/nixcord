{
  fetchFromGitHub,
  fetchPnpmDeps,
  vencord,
  buildWebExtension ? false,
  callPackage,
}:
let
  pnpm = callPackage ../pnpm { };
  version = "1.15.5-2026-09-09";
  rev = "0850f37fbb1623aa6330764d8f4b1e0b2617dcdf";
  hash = "sha256-AiZjrbx2A3NMkbyKJBGiCB/zq7fIvWlhpAAcyPrtT7Q=";
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
