{ fetchNpmDeps, lib }:
fetchNpmDeps {
  name = "nixcord-npm-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-Iw0L9ilGZ9CJI5Bsum6s2VW5Tfi2l/oCpCXFrUcFO4o=";
  fetcherVersion = 2;
}
