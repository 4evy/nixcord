{
  lib,
  nixcord-options,
  callPackage,
  revision,
  buildNpmPackage,
  writableTmpDirAsHomeHook,
  ...
}:
let
  nodejs = callPackage ../nix/nodejs.nix { };
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
      (lib.fileset.fromSource (import ../nix/workspace-source.nix { inherit lib; }))
      ../tsconfig.base.json
      ../modules/plugins/equicord.json
      ../modules/plugins/parse-rules.json
      ../modules/plugins/shared.json
      ../modules/plugins/vencord.json
      siteSources
    ];
  };

in
buildNpmPackage {
  pname = "nixcord-docs";
  version = revision;

  inherit src nodejs;
  npmDeps = callPackage ../pkgs/generate-options/node-modules.nix { };
  npmDepsFetcherVersion = 2;
  npmInstallFlags = [ "--ignore-scripts" ];
  nativeBuildInputs = [ writableTmpDirAsHomeHook ];

  npmWorkspace = "docs/site";
  env.NIXCORD_REVISION = revision;

  installPhase = ''
    runHook preInstall
    dest="$out/share/doc/nixcord"
    mkdir -p "$dest"
    cp -R docs/site/dist/. "$dest/"
    cp ${nixcord-options}/share/doc/nixos/options.json "$dest/options.json"
    runHook postInstall
  '';
}
