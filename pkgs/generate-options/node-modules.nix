{ callPackage, lib }:
(callPackage ../bun/fetch-deps.nix { }) {
  name = "plugin-generator-bun-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-JkzQWeIkyjRDQfgQef9avW8C5VlSAZvKcyl5331S3jI=";
}
