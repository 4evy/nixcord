{ fetchNpmDeps, lib }:
fetchNpmDeps {
  name = "nixcord-npm-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-5FhJJajsleWfMY0LlMNYt5sD/bF3NxNtRZj+QfbhRoY=";
  fetcherVersion = 2;
}
