{ callPackage, lib }:
(callPackage ../bun/fetch-deps.nix { }) {
  name = "plugin-generator-bun-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-gGV8f0jNpnpa0KLxYzao8mLYOuxwuhzfzChe16sUhmQ=";
}
