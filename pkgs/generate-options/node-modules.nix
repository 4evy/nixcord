{ fetchNpmDeps, lib }:
fetchNpmDeps {
  name = "nixcord-npm-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-UmKUpEmqznOp8oF3GX6wF6lUHFo8oWFwMwOWwvMyA9o=";
  fetcherVersion = 2;
}
