{ callPackage, lib }:
(callPackage ../bun/fetch-deps.nix { }) {
  name = "plugin-generator-bun-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-Z4/iq9sKeP4IEeuf8MCE6EpU5nY39+TuYOdXtl0EX60=";
}
