{ fetchNpmDeps, lib }:
fetchNpmDeps {
  name = "nixcord-npm-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-NjRz5y8IWR2Jsi+fTdRQf/KmAEeY59DUlxldC7P1Pck=";
  fetcherVersion = 2;
}
