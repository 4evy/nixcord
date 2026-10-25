{ fetchNpmDeps, lib }:
fetchNpmDeps {
  name = "plugin-generator-npm-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-J5G2RtRyP+D5u1XY1yEKldWmQe3NPQwI2iA5ep25m8o=";
  fetcherVersion = 2;
}
