{ pkgs }:

let
  testLib = import ../lib { inherit pkgs; };
  pluginName = testLib.fixtures.plugins.firstShared;
  evaluatedConfig = testLib.eval.darwin {
    enable = true;
    config.plugins.${pluginName}.enable = true;
  };
in
pkgs.runCommand "darwin-eval-test"
  {
    passAsFile = [ "configJson" ];
    configJson = testLib.output.serializeEvalConfig {
      inherit evaluatedConfig pluginName;
    };
  }
  ''
    echo "Darwin module evaluation successful"
    echo "Config size: $(wc -c < $configJsonPath) bytes"
    touch $out
  ''
