{ lib }:

let
  sharedNames = builtins.attrNames (builtins.fromJSON (builtins.readFile ../../plugins/shared.json));
  vencordNames = builtins.attrNames (
    builtins.fromJSON (builtins.readFile ../../plugins/vencord.json)
  );
  equicordNames = builtins.attrNames (
    builtins.fromJSON (builtins.readFile ../../plugins/equicord.json)
  );

  sharedSet = lib.genAttrs sharedNames (_: null);
  vencordSet = lib.genAttrs vencordNames (_: null);
  equicordSet = lib.genAttrs equicordNames (_: null);
in
{
  plugins = {
    inherit
      sharedNames
      vencordNames
      equicordNames
      ;

    firstShared = builtins.head sharedNames;
    firstVencordOnly = lib.findFirst (
      name: !(sharedSet ? ${name}) && !(equicordSet ? ${name})
    ) (throw "no vencord-only plugin found") vencordNames;
    firstEquicordOnly = lib.findFirst (
      name: !(sharedSet ? ${name}) && !(vencordSet ? ${name})
    ) (throw "no equicord-only plugin found") equicordNames;
  };
}
