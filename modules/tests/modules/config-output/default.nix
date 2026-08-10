{ pkgs }:

let
  testLib = import ../../lib { inherit pkgs; };
  collect = path: import path { inherit testLib; };
  tests = pkgs.lib.attrsets.mergeAttrsList (
    map collect [
      ./plugins.nix
      ./client-configs.nix
      ./quick-css.nix
      ./clients.nix
      ./one-off-clients.nix
      ./themes.nix
      ./equicord-content-warning.nix
      ./plugin-option-schema.nix
      ./multiple-discord-branches.nix
    ]
  );
in
testLib.run.tests "config-output-test" tests
