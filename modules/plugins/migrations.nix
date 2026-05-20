{ lib, ... }:
let
  data = builtins.fromJSON (builtins.readFile ./migrations.json);

  base = [
    "programs"
    "nixcord"
    "config"
    "plugins"
  ];

  mkRemovedPluginModule = import ../lib/mkRemovedPluginModule.nix { inherit lib; };

  mkRenameModule =
    migration:
    lib.modules.doRename {
      from = base ++ migration.from;
      to = base ++ migration.to;
      visible = false;
      warn = migration.warn or false;
      use = x: x;
    };
in
{
  imports =
    (map mkRenameModule (data.renames or [ ])) ++ (map mkRemovedPluginModule (data.removals or [ ]));
}
