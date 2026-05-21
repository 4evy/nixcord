{ testLib, lib }:

let
  inherit (testLib.assertions) hmWarnings;
in
{
  "disabled module is quiet" =
    let
      config = testLib.eval.hm {
        enable = false;
      };
    in
    assert config.assertions == [ ];
    assert config.warnings == [ ];
    true;

  "renamed target plugin is not deprecated" =
    let
      warnings = hmWarnings {
        enable = true;
        config.plugins.userMessagesPronouns.enable = true;
      };
    in
    assert warnings == [ ];
    true;

  "deprecated typed plugin name warns with replacement" =
    let
      warnings = hmWarnings {
        enable = true;
        config.plugins.PronounDB.enable = true;
      };
    in
    assert builtins.any (message: lib.hasInfix "PronounDB" message) warnings;
    assert builtins.any (message: lib.hasInfix "userMessagesPronouns" message) warnings;
    true;

  "deprecated freeform plugin name warns" =
    let
      warnings = hmWarnings {
        enable = true;
        extraConfig.plugins.PronounDB.enable = true;
      };
    in
    assert builtins.any (message: lib.hasInfix "PronounDB" message) warnings;
    true;
}
