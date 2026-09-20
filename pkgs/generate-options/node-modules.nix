{ fetchNpmDeps, lib }:
fetchNpmDeps {
  name = "nixcord-npm-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-peEFHNgMsnyBnb3TpGaXjR+N5Q/zbmh3EFEN/G3gr1U=";
  fetcherVersion = 2;
}
