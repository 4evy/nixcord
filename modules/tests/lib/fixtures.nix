{ lib }:

let
  sharedNames = builtins.attrNames (lib.importJSON ../../plugins/shared.json);
  vencordNames = builtins.attrNames (lib.importJSON ../../plugins/vencord.json);
  equicordNames = builtins.attrNames (lib.importJSON ../../plugins/equicord.json);

  sharedSet = lib.genAttrs sharedNames (_: null);
  vencordSet = lib.genAttrs vencordNames (_: null);
  equicordSet = lib.genAttrs equicordNames (_: null);
in
{
  plugins = {
    firstVencordOnly = lib.findFirst (
      name: !(builtins.hasAttr name sharedSet) && !(builtins.hasAttr name equicordSet)
    ) (throw "no vencord-only plugin found") vencordNames;
    firstEquicordOnly = lib.findFirst (
      name: !(builtins.hasAttr name sharedSet) && !(builtins.hasAttr name vencordSet)
    ) (throw "no equicord-only plugin found") equicordNames;
  };
}
