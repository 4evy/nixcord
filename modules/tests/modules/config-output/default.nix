{ pkgs }:

let
  testLib = import ../../lib { inherit pkgs; };
  collect = path: import path { inherit testLib; };
  tests = builtins.foldl' (all: path: all // collect path) { } [
    ./plugins.nix
    ./quick-css.nix
    ./clients.nix
    ./themes.nix
    ./equicord-content-warning.nix
  ];
in
testLib.run.tests "config-output-test" tests
