{ pkgs }:

let
  testLib = import ../../lib { inherit pkgs; };
  inherit (testLib) lib;
  collect = path: import path { inherit testLib lib; };
  tests = builtins.foldl' (all: path: all // collect path) { } [
    ./mutual-exclusivity.nix
    ./plugin-client-compat.nix
    ./package-compat.nix
    ./json-types.nix
    ./deprecated-plugins.nix
  ];
in
testLib.run.tests "assertions-test" tests
