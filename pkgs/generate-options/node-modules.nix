{ fetchNpmDeps, lib }:
fetchNpmDeps {
  name = "plugin-generator-npm-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-2g/7+1Sj1o9cbSD2ZBmioBYZqApuyESdNQ0mHpVMiOI=";
  fetcherVersion = 2;
}
