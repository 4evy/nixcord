{ callPackage, lib }:
(callPackage ../bun/fetch-deps.nix { }) {
  name = "plugin-generator-bun-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-AsTkPwxZHRA4n4bNvMH+Yi1eZXQRd+j83T8Fh17xiNw=";
}
