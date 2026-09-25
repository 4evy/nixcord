{ fetchNpmDeps, lib }:
fetchNpmDeps {
  name = "nixcord-npm-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-31YtzS9rzyE8WHNk+P/XmRzz7l1Vi5WXB4z2aIcqImk=";
  fetcherVersion = 2;
}
