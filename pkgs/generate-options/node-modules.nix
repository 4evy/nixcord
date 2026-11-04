{ callPackage, lib }:
(callPackage ../bun/fetch-deps.nix { }) {
  name = "plugin-generator-bun-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-rhnvEx55QydH4A0n5LasGn76SwlU7YN0ZmD11ihTYLE=";
}
