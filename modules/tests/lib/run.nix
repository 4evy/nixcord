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
          expr = if builtins.isString result then true else result;
          expected = true;
        }) tests
      );
    in
    assert
      lib.debug.throwTestFailures {
        inherit failures;
        description = name;
      } == null;
    pkgs.runCommand name { nativeBuildInputs = [ pkgs.jq ]; } ''
      ${lib.strings.concatStringsSep "\n" (
        lib.attrsets.mapAttrsToList (case: result: ''
          echo ${lib.strings.escapeShellArg case}
          ${if builtins.isString result then result else ""}
        '') tests
      )}
      echo '${toString (builtins.length testNames)} ${name} tests passed'
      touch $out
    '';
}
