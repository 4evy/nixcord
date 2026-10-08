{ fetchNpmDeps, lib }:
fetchNpmDeps {
  name = "plugin-generator-npm-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-J/zVtCU0hpYiklyg58D1JC81LB8HHNEQcg2A9HwvytE=";
  fetcherVersion = 2;
}
