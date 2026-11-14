{ callPackage, lib }:
(callPackage ../bun/fetch-deps.nix { }) {
  name = "plugin-generator-bun-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-hbFileBonbo/c8M7eBuc6uzboMYBrN+gFTvzlL4tknY=";
}
