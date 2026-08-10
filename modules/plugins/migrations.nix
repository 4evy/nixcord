{ lib, ... }:
let
  data = lib.trivial.importJSON ./migrations.json;

  base = [
    "programs"
    "nixcord"
    "config"
    "plugins"
  ];

  mkRemovedPluginModule =
    pluginName: lib.modules.importApply ../lib/mkRemovedPluginModule.nix { inherit pluginName; };

  mkRenameModule =
    migration:
    lib.modules.doRename {
      from = base ++ migration.from;
      to = base ++ migration.to;
      visible = false;
      inherit (migration) warn;
      use = lib.trivial.id;
      condition = migration.condition or true;
    };
in
{
  imports =
    (map mkRenameModule data.renames)
    ++ (map mkRenameModule (data.identifierRenames or [ ]))
    ++ (map mkRemovedPluginModule data.removals);
}
