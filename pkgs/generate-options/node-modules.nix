{ fetchNpmDeps, lib }:
fetchNpmDeps {
  name = "plugin-generator-npm-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-WE5mKYtDrQGJ7gI2fiINB60fJSl1GG28XOlMk2jt+Ps=";
  fetcherVersion = 2;
}
