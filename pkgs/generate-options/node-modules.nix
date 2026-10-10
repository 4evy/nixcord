{ fetchNpmDeps, lib }:
fetchNpmDeps {
  name = "plugin-generator-npm-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-nlZtDlVe3KA0I1iOgtKZ3qAERmQSBcysdW9tHZty9vM=";
  fetcherVersion = 2;
}
