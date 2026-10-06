{ fetchNpmDeps, lib }:
fetchNpmDeps {
  name = "plugin-generator-npm-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-mpvrdr5BQJ+u6zX9bXyGVH4WmVhwBIslGAD6opVBgF4=";
  fetcherVersion = 2;
}
