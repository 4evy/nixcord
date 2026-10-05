{ fetchNpmDeps, lib }:
fetchNpmDeps {
  name = "plugin-generator-npm-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-a0eedXQajQjWZPwfOj1DssgkxrVc3cC6zXHqV8zoGkI=";
  fetcherVersion = 2;
}
