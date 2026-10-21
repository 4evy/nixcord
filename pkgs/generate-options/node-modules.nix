{ fetchNpmDeps, lib }:
fetchNpmDeps {
  name = "plugin-generator-npm-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-EJrNrxii4e1oWmHN7d0jiFlsuWf4yFeBQvp8gJz3dfA=";
  fetcherVersion = 2;
}
