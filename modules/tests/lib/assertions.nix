{ eval }:

let
  failures = config: builtins.filter (assertion: !assertion.assertion) config.assertions;
in
{
  inherit failures;

  hmMessages =
    moduleConfig: builtins.map (assertion: assertion.message) (failures (eval.hm moduleConfig));
  hmWarnings = moduleConfig: (eval.hm moduleConfig).warnings;
}
