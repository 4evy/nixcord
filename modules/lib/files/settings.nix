{ lib }:
let
  inherit (import ../discord.nix { inherit lib; }) disabledUpdateSettings;

  mkSettingsFiles =
    {
      pkgs,
      cfg,
      mkVencordCfg,
      vencordFullConfig,
      equicordFullConfig,
      vesktopFullConfig,
      equibopFullConfig,
    }:
    let
      jsonFormat = pkgs.formats.json { };
      discordSettings = cfg.discord.settings // disabledUpdateSettings;

      settingSpecs = {
        vencordSettingsFile = {
          enable = true;
          name = "settings";
          value = vencordFullConfig;
        };
        equicordSettingsFile = {
          enable = true;
          name = "equicord-settings";
          value = equicordFullConfig;
        };
        discordSettingsFile = {
          enable = cfg.discord.settings != { };
          name = "discord-settings";
          value = discordSettings;
        };
      }
      //
        lib.attrsets.concatMapAttrs
          (name: fullConfig: {
            "${name}SettingsFile" = {
              enable = true;
              name = "${name}-settings";
              value = fullConfig;
            };
            "${name}ClientSettingsFile" = {
              enable = cfg.${name}.settings != { };
              name = "${name}-client-settings";
              value = cfg.${name}.settings;
            };
            "${name}StateFile" = {
              enable = cfg.${name}.state != { };
              name = "${name}-state";
              value = cfg.${name}.state;
            };
          })
          {
            vesktop = vesktopFullConfig;
            equibop = equibopFullConfig;
          };
    in
    lib.attrsets.mapAttrs (
      _: spec:
      if spec.enable then jsonFormat.generate "${spec.name}.json" (mkVencordCfg spec.value) else null
    ) settingSpecs;

  mkThemeFile =
    { pkgs }:
    name: value:
    if builtins.isPath value || lib.strings.isStorePath value then
      value
    else
      pkgs.writeText "theme-${name}.css" value;
in
{
  inherit mkSettingsFiles mkThemeFile;
}
