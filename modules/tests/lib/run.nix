{ pkgs, lib }:

{
  tests =
    name: tests:
    let
      testNames = builtins.attrNames tests;
      failures = lib.debug.runTests (
        {
          tests = testNames;
        }
        // lib.attrsets.mapAttrs (_: result: {
          expr = result;
          expected = true;
        }) tests
      );
    in
    assert
      lib.debug.throwTestFailures {
        inherit failures;
        description = name;
      } == null;
    pkgs.runCommand name { } ''
      echo '${toString (builtins.length testNames)} ${name} tests passed'
      touch $out
    '';
}
