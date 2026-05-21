{ eval }:

let
  failures = config: builtins.filter (assertion: !assertion.assertion) config.assertions;
in
{
  inherit failures;

  hmFails = nixcordConfig: failures (eval.hm nixcordConfig) != [ ];
  hmMessages =
    nixcordConfig: builtins.map (assertion: assertion.message) (failures (eval.hm nixcordConfig));
  hmWarnings = nixcordConfig: (eval.hm nixcordConfig).warnings;
}
