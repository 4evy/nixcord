{ callPackage, lib }:
(callPackage ../bun/fetch-deps.nix { }) {
  name = "plugin-generator-bun-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-uTDmFNyKFAgwHCJ3UJbteWm5DN8VjKl0XQXXyFcz0qI=";
}
