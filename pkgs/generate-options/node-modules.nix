{ fetchNpmDeps, lib }:
fetchNpmDeps {
  name = "nixcord-npm-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-+RfPVInHzgJCzEd4u1jlS8f6L2k3Qo63bzqQY8IA0jo=";
  fetcherVersion = 2;
}
