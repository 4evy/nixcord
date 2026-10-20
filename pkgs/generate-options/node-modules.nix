{ fetchNpmDeps, lib }:
fetchNpmDeps {
  name = "plugin-generator-npm-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-4vJlLpNYbDT28wuMCZkXDVjIMZ4jdnb+Vs1ss2bcHqE=";
  fetcherVersion = 2;
}
