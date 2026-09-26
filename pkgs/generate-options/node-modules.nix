{ fetchNpmDeps, lib }:
fetchNpmDeps {
  name = "nixcord-npm-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-iNy8BOVOkABnOR5VYtWlHD70vxxFE9kd+5au3XmAFsI=";
  fetcherVersion = 2;
}
