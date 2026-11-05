{ callPackage, lib }:
(callPackage ../bun/fetch-deps.nix { }) {
  name = "plugin-generator-bun-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-Iwbuq6LJyjPce85nvMMRaaBrl4gbgPVJ787VJrRarKA=";
}
