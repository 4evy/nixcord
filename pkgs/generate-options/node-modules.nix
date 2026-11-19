{ callPackage, lib }:
(callPackage ../bun/fetch-deps.nix { }) {
  name = "plugin-generator-bun-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-8vYwtUEEEYiEX4HfnY23O0m9FTeRwt/KWzr9/Srvzlw=";
}
