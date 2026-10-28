{ callPackage, lib }:
(callPackage ../bun/fetch-deps.nix { }) {
  name = "plugin-generator-bun-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-q7K/nVhjfNd6/NGMdy9DAQmFVOPZj3aSo6cODN/MZME=";
}
