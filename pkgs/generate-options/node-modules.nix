{ fetchNpmDeps, lib }:
fetchNpmDeps {
  name = "nixcord-npm-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-2RCQHulPU7rnDTdaRSjNM2X9zKhtPNHA7lhgiC50sLA=";
  fetcherVersion = 2;
}
