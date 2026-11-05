{ callPackage, lib }:
(callPackage ../bun/fetch-deps.nix { }) {
  name = "plugin-generator-bun-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-23TDdsBp7FgWW6jZ2/pPtSnMDKYqvd5oWlte5wrQlVs=";
}
