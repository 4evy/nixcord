{
  bun,
  lib,
  nixcord-options,
  nodejs,
  revision,
  stdenvNoCC,
  writableTmpDirAsHomeHook,
  ...
}:
let
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
      ../bun.lock
      ../package.json
      ../modules/plugins/equicord.json
      ../modules/plugins/parse-rules.json
      ../modules/plugins/shared.json
      ../modules/plugins/vencord.json
      siteSources
    ];
  };

  depsSrc = lib.fileset.toSource {
    root = ./..;
    fileset = lib.fileset.unions [
      ../bun.lock
      ../package.json
      ./site/package.json
      ../packages/ast/package.json
      ../packages/cli/package.json
      ../packages/git-analyzer/package.json
      ../packages/nix-generator/package.json
      ../packages/parser/package.json
      ../packages/shared/package.json
    ];
  };

  inherit (stdenvNoCC.hostPlatform) system;

  outputHashes = {
    x86_64-linux = "sha256-cT71HCs+XwhsYmaxnoJ1P18uAzA2z4z+SusP4JGwD8c=";
    aarch64-darwin = "sha256-+P5kSKIAfVuGEHIFkyE9NS5ggCmT7YCrLJHq/FAbf7g=";
  };

  deps = stdenvNoCC.mkDerivation {
    pname = "nixcord-docs-deps";
    version = "latest";

    src = depsSrc;
    nativeBuildInputs = [
      bun
      writableTmpDirAsHomeHook
    ];

    dontConfigure = true;
    dontFixup = true;

    buildPhase = ''
      runHook preBuild
      export BUN_INSTALL_CACHE_DIR="$TMPDIR/bun-cache"
      bun install --filter nixcord-docs --frozen-lockfile --no-progress
      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall
      mkdir -p "$out"
      mkdir -p "$out/docs/site"
      cp -R node_modules "$out/node_modules"
      cp -R docs/site/node_modules "$out/docs/site/node_modules"
      runHook postInstall
    '';

    outputHashAlgo = "sha256";
    outputHashMode = "recursive";
    outputHash = outputHashes.${system} or (throw "Unsupported system: ${system}");
  };
in
stdenvNoCC.mkDerivation {
  pname = "nixcord-docs";
  version = revision;

  passthru = { inherit deps; };

  inherit src;
  nativeBuildInputs = [
    bun
    nodejs
    writableTmpDirAsHomeHook
  ];

  configurePhase = ''
    runHook preConfigure
    rm -rf node_modules docs/site/node_modules
    cp -R ${deps}/node_modules ./node_modules
    cp -R ${deps}/docs/site/node_modules ./docs/site/node_modules
    chmod -R u+w ./node_modules ./docs/site/node_modules
    patchShebangs --build node_modules docs/site/node_modules
    runHook postConfigure
  '';

  buildPhase = ''
    runHook preBuild
    set -a
    ${lib.strings.toShellVars {
      NIXCORD_REVISION = revision;
    }}
    set +a
    cd docs/site
    node node_modules/vite/bin/vite.js build
    cd ../..
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    dest="$out/share/doc/nixcord"
    mkdir -p "$dest"
    cp -R docs/site/dist/. "$dest/"
    cp ${nixcord-options}/share/doc/nixos/options.json "$dest/options.json"
    runHook postInstall
  '';
}
