{ callPackage, lib }:
(callPackage ../bun/fetch-deps.nix { }) {
  name = "plugin-generator-bun-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-Lrhhrp1FPFq4GHLrE1klDx400LvNnbzpD3lCaG77vX8=";
}
