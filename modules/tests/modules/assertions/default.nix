{ pkgs }:

let
  testLib = import ../../lib { inherit pkgs; };
  lib = testLib.lib;
  collect = path: import path { inherit testLib lib; };
  tests = builtins.foldl' (all: path: all // collect path) { } [
    ./mutual-exclusivity.nix
    ./plugin-client-compat.nix
    ./deprecated-plugins.nix
  ];
in
testLib.run.tests "assertions-test" tests
