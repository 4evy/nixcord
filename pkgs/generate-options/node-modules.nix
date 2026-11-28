{ callPackage, lib }:
(callPackage ../bun/fetch-deps.nix { }) {
  name = "plugin-generator-bun-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-aRu0ctQ/AHCs94YXru+hazXN5l87ASb+dzXN0Ck7+Y4=";
}
