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
  manifest = lib.trivial.importJSON ../package.json;
  npmVersion = lib.strings.removePrefix "npm@" manifest.packageManager;
  nodePatches = path + "/pkgs/development/web/nodejs";
  nodejsSlim =
    if stdenvNoCC.hostPlatform.system == "aarch64-linux" && nodejs-slim_26.version == "26.10.0" then
      nodejs-slim_26.overrideAttrs (old: {
        # V8's ARM NEON memcpy uses CHAR_BIT without including its header
        postPatch = (old.postPatch or "") + ''
          substituteInPlace deps/v8/src/base/memcopy.h \
            --replace-fail '#include <atomic>' $'#include <atomic>\n#include <climits>'
        '';
      })
    else
      nodejs-slim_26;
  npm = stdenvNoCC.mkDerivation {
    pname = "npm";
    version = npmVersion;
    src = fetchurl {
      url = "https://registry.npmjs.org/npm/-/npm-${npmVersion}.tgz";
      hash = "sha256-Zma0iBazm4bD/rrHtRpO5N5sXKWJw4KtgAS2sRP4Znc=";
    };
    nativeBuildInputs = lib.optional stdenvNoCC.hostPlatform.isDarwin patchutils;
    buildInputs = [ nodejsSlim ];
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
) "Update nixpkgs-packages to provide the Node version pinned in package.json";
nodejs_26.override {
  nodejs-slim = nodejsSlim // {
    inherit npm;
  };
}
