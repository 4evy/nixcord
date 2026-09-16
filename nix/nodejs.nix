{
  nodejs_26,
  nodejs-slim_26,
  fetchurl,
}:
let
  version = (builtins.fromJSON (builtins.readFile ../package.json)).engines.node;
  nodejs-slim = nodejs-slim_26.overrideAttrs {
    inherit version;
    src = fetchurl {
      url = "https://nodejs.org/dist/v${version}/node-v${version}.tar.xz";
      hash = "sha256-NrN79e5NCSudnf8tGpCxRE+LRT7d9v+Wyr3ruX0y9B0=";
    };
  };
in
nodejs_26.override { inherit nodejs-slim; }
