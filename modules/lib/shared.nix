{ lib, ... }:
lib.pipe
  [
    ./patching.nix
    ./plugins.nix
    ./files.nix
    ./config.nix
  ]
  [
    (map (path: import path { inherit lib; }))
    lib.mergeAttrsList
  ]
