{ callPackage, lib }:
(callPackage ../bun/fetch-deps.nix { }) {
  name = "plugin-generator-bun-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-ihy/FAHl8JNcMi0sgCLBDf0IQufD6Ire1x3qI73PjKw=";
}
