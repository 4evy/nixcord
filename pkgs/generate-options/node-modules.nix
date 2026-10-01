{ fetchNpmDeps, lib }:
fetchNpmDeps {
  name = "nixcord-npm-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-fZ0kvIs7mwnU8oiO6cjjrI3GN9ynkanpvGhP71eh42g=";
  fetcherVersion = 2;
}
