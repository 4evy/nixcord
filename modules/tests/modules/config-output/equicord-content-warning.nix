{ testLib }:

let
  common = import ./common.nix { inherit testLib; };
  inherit (common) baseConfig discordModSettingsJSON recursiveUpdate;
in
{
  "contentWarning trigger words are written for Equicord" =
    let
      config = testLib.eval.hm (
        recursiveUpdate baseConfig {
          discord.vencord.enable = false;
          discord.equicord.enable = true;
          config.plugins.contentWarning = {
            enable = true;
            triggerWords = [
              "spoiler"
              "secret"
            ];
          };
        }
      );
      settingsJson = discordModSettingsJSON config;
    in
    assert settingsJson.plugins.ContentWarning.enabled == true;
    assert
      settingsJson.plugins.ContentWarning.triggerWords == [
        "spoiler"
        "secret"
      ];
    true;

  "unset contentWarning trigger words keep upstream fallback active" =
    let
      config = testLib.eval.hm (
        recursiveUpdate baseConfig {
          discord.vencord.enable = false;
          discord.equicord.enable = true;
          config.plugins.contentWarning.enable = true;
        }
      );
      settingsJson = discordModSettingsJSON config;
    in
    assert settingsJson.plugins.ContentWarning.enabled == true;
    assert settingsJson.plugins.ContentWarning.triggerWords == null;
    true;
}
