{ callPackage, lib }:
(callPackage ../bun/fetch-deps.nix { }) {
  name = "plugin-generator-bun-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-tw0cBpo/IYmVGGS/unPcEmB2A/y3CZHNR/zj8Eg7BEA=";
}
