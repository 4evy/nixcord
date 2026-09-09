{
  fetchFromGitHub,
  fetchPnpmDeps,
  vencord,
  buildWebExtension ? false,
  callPackage,
  nix-update-script,
}:
let
  pnpm = callPackage ../pnpm { };
  version = "1.15.4-2026-08-30";
  rev = "0e40e433d7aa9168f656aba733d01e761b7ca8ca";
  hash = "sha256-IoyxQuFrTlpwTqYgqsbeoLMuw8Hh7IJlvQi7ULdNAR0=";
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
        updateScript = nix-update-script {
          attrPath = "vencord";
          extraArgs = [
            "--flake"
            "--version=branch=main"
            "--override-filename=pkgs/vencord/default.nix"
          ];
        };
      };
    }
  )
