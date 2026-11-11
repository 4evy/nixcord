{ callPackage, lib }:
(callPackage ../bun/fetch-deps.nix { }) {
  name = "plugin-generator-bun-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-Tu7ZMWbuVz8fVnZ3IuP9c4IPHp6J28O9rihO4RP1wEg=";
}
