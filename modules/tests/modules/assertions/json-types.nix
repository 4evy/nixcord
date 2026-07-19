{ testLib, ... }:

let
  optionEvaluationFails = config: !(builtins.tryEval config).success;
in
{
  "extraConfig rejects values that cannot be represented as JSON" =
    let
      config = testLib.eval.hm {
        enable = true;
        extraConfig.invalid = value: value;
      };
    in
    assert optionEvaluationFails config.programs.nixcord.extraConfig.invalid;
    true;

  "desktop client settings reject values that cannot be represented as JSON" =
    let
      config = testLib.eval.hm {
        enable = true;
        discord.enable = false;
        vesktop = {
          enable = true;
          settings.invalid = value: value;
        };
      };
    in
    assert optionEvaluationFails config.programs.nixcord.vesktop.settings.invalid;
    true;

  "dorion extraSettings rejects values that cannot be represented as JSON" =
    let
      config = testLib.eval.hm {
        enable = true;
        discord.enable = false;
        dorion = {
          enable = true;
          extraSettings.invalid = value: value;
        };
      };
    in
    assert optionEvaluationFails config.programs.nixcord.dorion.extraSettings.invalid;
    true;
}
