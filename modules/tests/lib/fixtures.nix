{ lib }:

let
  paths = import ../../plugins/schema/schema.nix;
  sharedNames = builtins.attrNames paths.shared;
  vencordNames = builtins.attrNames paths.vencord;
  equicordNames = builtins.attrNames paths.equicord;

  sharedSet = lib.attrsets.genAttrs sharedNames (_: null);
  vencordSet = lib.attrsets.genAttrs vencordNames (_: null);
  equicordSet = lib.attrsets.genAttrs equicordNames (_: null);
in
{
  plugins = {
    firstVencordOnly = lib.lists.findFirst (
      name: !(builtins.hasAttr name sharedSet) && !(builtins.hasAttr name equicordSet)
    ) (throw "no vencord-only plugin found") vencordNames;
    firstEquicordOnly = lib.lists.findFirst (
      name: !(builtins.hasAttr name sharedSet) && !(builtins.hasAttr name vencordSet)
    ) (throw "no equicord-only plugin found") equicordNames;
  };
}
