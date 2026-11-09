{ callPackage, lib }:
(callPackage ../bun/fetch-deps.nix { }) {
  name = "plugin-generator-bun-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-YV9UwvkQULsUuYz3HY0sY/nf9cjUpAhOdlHxVVRhMyQ=";
}
