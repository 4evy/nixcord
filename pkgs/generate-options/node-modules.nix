{ fetchNpmDeps, lib }:
fetchNpmDeps {
  name = "plugin-generator-npm-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-xMcFQcHsIX0zaBUUDGPHDHwQkpDJUJK/oGR/AnpGPFw=";
  fetcherVersion = 2;
}
