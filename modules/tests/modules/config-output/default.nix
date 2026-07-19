{ pkgs }:

let
  testLib = import ../../lib { inherit pkgs; };
  collect = path: import path { inherit testLib; };
  tests = builtins.foldl' (all: path: all // collect path) { } [
    ./plugins.nix
    ./client-configs.nix
    ./quick-css.nix
    ./clients.nix
    ./one-off-clients.nix
    ./themes.nix
    ./equicord-content-warning.nix
  ];
in
testLib.run.tests "config-output-test" tests
