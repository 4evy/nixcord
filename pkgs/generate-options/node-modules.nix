{ fetchNpmDeps, lib }:
fetchNpmDeps {
  name = "plugin-generator-npm-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-lyFq2vuk+gX7hDe7xo6i9zo9BWJZJFRl7OGr3+x5Dtk=";
  fetcherVersion = 2;
}
