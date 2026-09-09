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
    pluginName: lib.modules.importApply ./migrations/removed-plugin.nix { inherit pluginName; };

  mkRemovedSettingModule =
    settingPath: lib.modules.importApply ./migrations/removed-setting.nix { inherit settingPath; };

  mkClientPluginRenameModule =
    migration: lib.modules.importApply ./migrations/client-rename.nix { inherit migration; };

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
    ++ (map mkClientPluginRenameModule (data.clientRenames or [ ]))
    ++ (map mkRemovedPluginModule data.removals)
    ++ (map mkRemovedSettingModule (data.settingRemovals or [ ]));
}
