{
  lib,
  nixcord-options,
  callPackage,
  revision,
  ...
}:
let
  buildBunPackage = callPackage ../pkgs/bun/build-package.nix { };
  siteSources = lib.fileset.difference ./site (
    lib.fileset.unions (
      map lib.fileset.maybeMissing [
        ./site/dist
        ./site/node_modules
      ]
    )
  );

  src = lib.fileset.toSource {
    root = ./..;
    fileset = lib.fileset.unions [
      ../modules/plugins/parse-rules.json
      # The generator project already includes workspace manifests and TS config
      (lib.fileset.fromSource (import ../pkgs/generate-options/sources.nix { inherit lib; }).project)
      siteSources
    ];
  };

in
buildBunPackage {
  pname = "nixcord-docs";
  version = revision;

  inherit src;
  bunDeps = callPackage ../pkgs/generate-options/node-modules.nix { };
  buildPhase = ''
    runHook preBuild
    bun run --bun docs:build
    runHook postBuild
  '';
  env.NIXCORD_REVISION = revision;

  installPhase = ''
    runHook preInstall
    dest="$out/share/doc/nixcord"
    mkdir --parents "$dest"
    cp --recursive docs/site/dist/. "$dest/"
    cp ${nixcord-options}/share/doc/nixos/options.json "$dest/options.json"
    runHook postInstall
  '';
}
