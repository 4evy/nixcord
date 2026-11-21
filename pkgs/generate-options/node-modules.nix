{ callPackage, lib }:
(callPackage ../bun/fetch-deps.nix { }) {
  name = "plugin-generator-bun-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-aERbmjASZzdBLkn6cBoOg4rnKtbSW9Adykq1b64r+wE=";
}
