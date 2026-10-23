{
  lib,
  callPackage,
  nix-update-script,
}:
let
  src = lib.fileset.toSource {
    root = ./.;
    fileset = lib.fileset.unions [
      ./package.json
      ./bun.lock
    ];
  };
  buildBunPackage = callPackage ../../bun/build-package.nix { };
in
buildBunPackage {
  pname = "discord-patch-tools";
  version = "1.0.0";
  inherit src;
  bunDeps = (callPackage ../../bun/fetch-deps.nix { }) {
    name = "discord-patch-tools-bun-deps";
    inherit src;
    hash = "sha256-GV0rCLnPUJ2AzPXuCHeKuuQd56q27Q11M6fh9rmDGJg=";
  };
  dontBuild = true;
  # Keep source scripts independent of local node_modules installations
  passthru.scriptSource = lib.fileset.toSource {
    root = ./.;
    fileset = lib.fileset.unions [
      ./bundle.ts
      ./updater/main.ts
      ./launcher/main.ts
      ./krisp/main.ts
    ];
  };
  passthru.updateScript = nix-update-script {
    attrPath = "discord-patch-tools";
    extraArgs = [
      "--flake"
      "--version=skip"
      "--no-src"
      "--custom-dep=bunDeps"
      "--override-filename=pkgs/discord/patching/default.nix"
    ];
  };
  installPhase = ''
    runHook preInstall
    mkdir --parents "$out"
    cp --recursive node_modules "$out/"
    runHook postInstall
  '';
}
