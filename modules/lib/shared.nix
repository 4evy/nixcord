{ lib, ... }:
lib.trivial.pipe
  [
    ./patching.nix
    ./plugins.nix
    ./files.nix
    ./config.nix
    ./discord.nix
  ]
  [
    (map (path: import path { inherit lib; }))
    (lib.lists.foldl' lib.attrsets.unionOfDisjoint { })
  ]
