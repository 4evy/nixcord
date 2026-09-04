# mkClientPluginRenameModule :: migration -> NixOS module
#
# Copies a client-specific legacy plugin option to its replacement without
# shadowing an option that still belongs to another client.
{ migration }:
{
  config,
  lib,
  options,
  ...
}:
let
  base = [
    "programs"
    "nixcord"
    "config"
    "plugins"
  ];
  oldPath = base ++ migration.from;
  newPath = base ++ migration.to;
  oldOption = lib.attrsets.attrByPath oldPath null options;
  targetPluginName = builtins.head migration.to;
  targetSettingPath = builtins.tail migration.to;

  sharedPlugins = lib.trivial.importJSON ../plugins/shared.json;
  vencordPlugins = lib.trivial.importJSON ../plugins/vencord.json;
  equicordPlugins = lib.trivial.importJSON ../plugins/equicord.json;

  hasSettingPath =
    setting: path:
    if path == [ ] then
      true
    else
      let
        child = lib.attrsets.attrByPath [ "settings" (builtins.head path) ] null setting;
      in
      child != null && hasSettingPath child (builtins.tail path);

  schemaHasTarget =
    schema:
    let
      plugin = schema.${targetPluginName} or null;
    in
    plugin != null
    && (
      targetSettingPath == [ "enable" ]
      || (targetSettingPath != [ ] && hasSettingPath plugin targetSettingPath)
    );

  hasVencordClient =
    config.programs.nixcord.discord.vencord.enable
    || config.programs.nixcord.vesktop.enable
    || config.programs.nixcord.dorion.enable
    || config.programs.nixcord.legcord.vencord.enable
    || (
      config.programs.nixcord.goofcord.enable && config.programs.nixcord.goofcord.clientMod == "vencord"
    );
  hasEquicordClient =
    config.programs.nixcord.discord.equicord.enable
    || config.programs.nixcord.equibop.enable
    || config.programs.nixcord.legcord.equicord.enable
    || (
      config.programs.nixcord.goofcord.enable && config.programs.nixcord.goofcord.clientMod == "equicord"
    );
  targetIsAvailable =
    (hasVencordClient && (schemaHasTarget sharedPlugins || schemaHasTarget vencordPlugins))
    || (hasEquicordClient && (schemaHasTarget sharedPlugins || schemaHasTarget equicordPlugins));

  optionDefaultPriority = (lib.modules.mkOptionDefault null).priority;
  oldOptionHasNonDefaultDefinition =
    lib.options.isOption oldOption && oldOption.highestPrio < optionDefaultPriority;
in
{
  options = lib.attrsets.optionalAttrs migration.declare (
    lib.attrsets.setAttrByPath oldPath (
      lib.options.mkOption {
        type = lib.types.nullOr lib.types.anything;
        default = null;
        visible = false;
        description = "Legacy option for a plugin renamed in one client.";
      }
    )
  );

  config = lib.modules.mkIf (oldOptionHasNonDefaultDefinition && targetIsAvailable) (
    lib.modules.mkAliasAndWrapDefsWithPriority (lib.attrsets.setAttrByPath newPath) oldOption
  );
}
