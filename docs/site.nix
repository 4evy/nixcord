{
  bun,
  lib,
  nixcord-options,
  nodejs,
  revision,
  stdenvNoCC,
  ...
}:
let
  src = lib.fileset.toSource {
    root = ./..;
    fileset = lib.fileset.unions [
      ../bun.lock
      ../package.json
      ../modules/plugins/equicord.json
      ../modules/plugins/parse-rules.json
      ../modules/plugins/shared.json
      ../modules/plugins/vencord.json
      ./site
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
    x86_64-linux = "sha256-G+JO1hZWAbp0W4vOi8dU8j8cXnfcBb/+OEp9CrglVN0=";
    aarch64-darwin = "sha256-XqlxTHxJiCena402QR2A/MastcA5mLBaHWnb7CifPMQ=";
  };

  deps = stdenvNoCC.mkDerivation {
    pname = "nixcord-docs-deps";
    version = "latest";

    src = depsSrc;
    nativeBuildInputs = [ bun ];

    dontConfigure = true;
    dontFixup = true;

    buildPhase = ''
      runHook preBuild
      set -a
      HOME="$TMPDIR"
      BUN_INSTALL_CACHE_DIR="$TMPDIR/bun-cache"
      set +a
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

  inherit src;
  nativeBuildInputs = [
    bun
    nodejs
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
    HOME="$TMPDIR"
    ${lib.toShellVars {
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
