{ fetchNpmDeps, lib }:
fetchNpmDeps {
  name = "nixcord-npm-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-m0CmXGmaoN3gFtpIB0cSGIEfCbsZNlMXLMIZp+rO/+c=";
  fetcherVersion = 2;
}
