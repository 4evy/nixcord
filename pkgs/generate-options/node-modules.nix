{ callPackage, lib }:
(callPackage ../bun/fetch-deps.nix { }) {
  name = "plugin-generator-bun-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-NdoYC09WX9KeH7RZcaIhYmbv+263vL/+5qnY1ol78Mw=";
}
