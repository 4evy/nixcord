{ lib }:
let
  mkAssertions =
    cfg: pluginKit:
    let
      inherit (pluginKit)
        enabledClients
        clientConfigs
        collectEnabledEquicordOnlyPlugins
        collectEnabledVencordOnlyPlugins
        ;
      goofcordAssets = cfg.goofcord.settings.assets or { };
      wrongEquicordPlugins = lib.lists.unique (
        lib.lists.concatMap collectEnabledEquicordOnlyPlugins clientConfigs
      );
      wrongVencordPlugins = lib.lists.unique (
        lib.lists.concatMap collectEnabledVencordOnlyPlugins clientConfigs
      );
    in
    [
      {
        assertion = !(cfg.discord.vencord.enable && cfg.discord.equicord.enable);
        message = "programs.nixcord.discord.vencord.enable and programs.nixcord.discord.equicord.enable cannot both be enabled at the same time. They are mutually exclusive.";
      }
      {
        assertion = !(cfg.legcord.vencord.enable && cfg.legcord.equicord.enable);
        message = "programs.nixcord.legcord.vencord.enable and programs.nixcord.legcord.equicord.enable cannot both be enabled at the same time. They are mutually exclusive.";
      }
      {
        assertion = !cfg.goofcord.enable || cfg.goofcord.package != null;
        message = "programs.nixcord.goofcord.enable requires programs.nixcord.goofcord.package to be non-null.";
      }
      {
        assertion = !cfg.goofcord.enable || builtins.isAttrs goofcordAssets;
        message = "programs.nixcord.goofcord.settings.assets must be an attribute set. Use programs.nixcord.goofcord.extraAssets for additional asset paths or URLs.";
      }
      {
        assertion =
          !cfg.goofcord.enable
          || !builtins.isAttrs goofcordAssets
          || builtins.all builtins.isString (builtins.attrValues goofcordAssets);
        message = "programs.nixcord.goofcord.settings.assets values must be strings containing local paths or URLs.";
      }
      {
        assertion = enabledClients != [ "vencord" ] || wrongEquicordPlugins == [ ];
        message = "The following Equicord-only plugins are enabled but only Vencord-based clients are active: ${lib.strings.concatStringsSep ", " wrongEquicordPlugins}. These plugins are not available in Vencord.";
      }
      {
        assertion = enabledClients != [ "equicord" ] || wrongVencordPlugins == [ ];
        message = "The following Vencord-only plugins are enabled but only Equicord-based clients are active: ${lib.strings.concatStringsSep ", " wrongVencordPlugins}. These plugins are not available in Equicord.";
      }
    ];
in
{
  inherit mkAssertions;
}
