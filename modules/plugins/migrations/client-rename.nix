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
  cfg = config.programs.nixcord;
  inherit (import ../../lib/plugins.nix { inherit lib; }) mkPluginKit;
  pluginKit = mkPluginKit cfg;

  # Dorion also consumes Vencord settings through its browser bootstrap.
  migrationClients = pluginKit.enabledClients ++ lib.lists.optional cfg.dorion.enable "vencord";
  targetIsAvailable = lib.lists.any (
    client: pluginKit.clientHasOptionPath client migration.to
  ) migrationClients;

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
