{ pkgs, lib }:

{
  tests =
    name: tests:
    let
      results = builtins.attrValues tests;
      count = builtins.length results;
      passed = lib.all (result: result) results;
    in
    pkgs.runCommand name { } ''
      ${if passed then "echo '${toString count} ${name} tests passed'" else "exit 1"}
      touch $out
    '';
}
