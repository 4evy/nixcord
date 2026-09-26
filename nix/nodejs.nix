{
  lib,
  nodejs_26,
  nodejs-slim_26,
  fetchurl,
  stdenvNoCC,
  path,
  patchutils,
}:
let
  manifest = builtins.fromJSON (builtins.readFile ../package.json);
  npmVersion = builtins.elemAt (builtins.split "@" manifest.packageManager) 2;
  nodePatches = path + "/pkgs/development/web/nodejs";
  npm = stdenvNoCC.mkDerivation {
    pname = "npm";
    version = npmVersion;
    src = fetchurl {
      url = "https://registry.npmjs.org/npm/-/npm-${npmVersion}.tgz";
      hash = "sha256-8I5nTjHrmZMd8il6pVwnS/m+vZBnna1X/b6Wg5B6MyU=";
    };
    nativeBuildInputs = lib.optional stdenvNoCC.hostPlatform.isDarwin patchutils;
    buildInputs = [ nodejs-slim_26 ];
    # Preserve Nixpkgs' offline npm and sandboxed node-gyp behavior.
    patches = [ (nodePatches + "/node-npm-build-npm-package-logic.patch") ];
    patchFlags = [ "-p3" ];
    postPatch = lib.optionalString stdenvNoCC.hostPlatform.isDarwin ''
      filterdiff -p1 -i 'deps/npm/*' \
        ${nodePatches + "/gyp-patches-set-fallback-value-for-CLT-darwin.patch"} \
        | patch -p3
    '';
    dontBuild = true;
    installPhase = ''
      runHook preInstall
      mkdir -p "$out/lib/node_modules/npm" "$out/bin"
      cp -R . "$out/lib/node_modules/npm"
      ln -s ../lib/node_modules/npm/bin/npm-cli.js "$out/bin/npm"
      ln -s ../lib/node_modules/npm/bin/npx-cli.js "$out/bin/npx"
      runHook postInstall
    '';
  };
in
# Updating npm must not invalidate the cached Node/V8 compilation.
assert lib.assertMsg (
  nodejs-slim_26.version == manifest.engines.node
) "Update nixpkgs-nixcord to provide the Node version pinned in package.json";
nodejs_26.override {
  nodejs-slim = nodejs-slim_26 // {
    inherit npm;
  };
}
