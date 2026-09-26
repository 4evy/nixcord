{ fetchNpmDeps, lib }:
fetchNpmDeps {
  name = "nixcord-npm-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-mBApr4LpSioUuq0u0gyJuf2dlJrpDZ7eZmmzLN2SZ2M=";
  fetcherVersion = 2;
}
