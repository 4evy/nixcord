{ fetchNpmDeps, lib }:
fetchNpmDeps {
  name = "nixcord-npm-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-GNf7xgJLLQaU6ogRKuFFraSxLVB9W8jujO33Wz4i8jo=";
  fetcherVersion = 2;
}
