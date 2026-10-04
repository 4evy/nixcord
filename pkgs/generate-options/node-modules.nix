{ fetchNpmDeps, lib }:
fetchNpmDeps {
  name = "nixcord-npm-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-RKkfpAw7cMx3vD/hAprTQXamyfR3x+cEqKOEI6Sw9mY=";
  fetcherVersion = 2;
}
