{ lib, ... }:
lib.trivial.pipe
  [
    ./patching.nix
    ./plugins/plugins.nix
    ./files/files.nix
    ./packages/installed.nix
    ./config.nix
    ./discord.nix
  ]
  [
    (map (path: import path { inherit lib; }))
    (lib.lists.foldl' lib.attrsets.unionOfDisjoint { })
  ]
