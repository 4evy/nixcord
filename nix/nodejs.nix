{
  nodejs_26,
  nodejs-slim_26,
  fetchurl,
}:
let
  manifest = builtins.fromJSON (builtins.readFile ../package.json);
  version = manifest.engines.node;
  npmVersion = builtins.elemAt (builtins.split "@" manifest.packageManager) 2;
  npmSource = fetchurl {
    url = "https://registry.npmjs.org/npm/-/npm-${npmVersion}.tgz";
    hash = "sha256-8I5nTjHrmZMd8il6pVwnS/m+vZBnna1X/b6Wg5B6MyU=";
  };
  nodejs-slim = nodejs-slim_26.overrideAttrs (old: {
    inherit version;
    src = fetchurl {
      url = "https://nodejs.org/dist/v${version}/node-v${version}.tar.xz";
      hash = "sha256-ezpUbTPLfhWkO916V+C+XV/V/8VT5uTBIAM+ZvC6IMU=";
    };
    # Replace bundled npm before Nixpkgs applies its buildNpmPackage patches.
    postUnpack = (old.postUnpack or "") + ''
      rm -rf "$sourceRoot/deps/npm"
      mkdir -p "$sourceRoot/deps/npm"
      tar -xzf ${npmSource} --strip-components=1 -C "$sourceRoot/deps/npm"
    '';
  });
in
nodejs_26.override { inherit nodejs-slim; }
