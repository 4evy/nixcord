{ testLib }:

let
  common = import ./common.nix { inherit testLib; };
  inherit (common) baseConfig discordModSettingsSource recursiveUpdate;
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
      settingsJson = discordModSettingsSource config;
    in
    ''
      ${testLib.output.json settingsJson ''.plugins.ContentWarning.enabled == true and .plugins.ContentWarning.triggerWords == ["spoiler", "secret"]''}
    '';

  "unset contentWarning trigger words keep upstream fallback active" =
    let
      config = testLib.eval.hm (
        recursiveUpdate baseConfig {
          discord.vencord.enable = false;
          discord.equicord.enable = true;
          config.plugins.contentWarning.enable = true;
        }
      );
      settingsJson = discordModSettingsSource config;
    in
    ''
      ${testLib.output.json settingsJson ''.plugins.ContentWarning.enabled == true and .plugins.ContentWarning.triggerWords == null and (.plugins.ContentWarning | has("triggerWords"))''}
    '';
}
