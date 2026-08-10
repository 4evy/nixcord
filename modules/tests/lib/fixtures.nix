{ lib }:

let
  sharedNames = builtins.attrNames (lib.trivial.importJSON ../../plugins/shared.json);
  vencordNames = builtins.attrNames (lib.trivial.importJSON ../../plugins/vencord.json);
  equicordNames = builtins.attrNames (lib.trivial.importJSON ../../plugins/equicord.json);

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
