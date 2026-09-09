# Builds NixOS module options from a plugin schema.
# Each plugin gets an `enable` option plus any declared settings.
{
  lib,
  file ? null,
  schema ? lib.trivial.importJSON file,
  ...
}:
let
  jsonAttrs = lib.types.attrsOf lib.types.json;

  # Map type strings from the JSON schema to actual Nix types.
  typeMap = {
    "types.bool" = lib.types.bool;
    "types.str" = lib.types.str;
    "types.int" = lib.types.int;
    "types.float" = lib.types.float;
    "types.attrs" = jsonAttrs;
    "types.nullOr types.str" = lib.types.nullOr lib.types.str;
    "types.nullOr types.attrs" = lib.types.nullOr jsonAttrs;
    "types.nullOr (types.listOf types.str)" = lib.types.nullOr (lib.types.listOf lib.types.str);
    "types.listOf types.str" = lib.types.listOf lib.types.str;
    "types.listOf types.number" = lib.types.listOf lib.types.number;
    "types.listOf types.bool" = lib.types.listOf lib.types.bool;
    "types.listOf types.attrs" = lib.types.listOf jsonAttrs;
    "types.listOf types.anything" = lib.types.listOf lib.types.anything;
  };

  resolveDefault =
    type: value:
    if
      builtins.elem type [
        "types.int"
        "types.float"
      ]
      && builtins.isAttrs value
      && builtins.attrNames value == [ "__nixRaw" ]
    then
      # Raw Nix expressions serialized as { __nixRaw = "1.0"; }
      builtins.fromJSON value.__nixRaw
    else
      value;

  mkSettingOption =
    _name:
    setting@{
      type ? null,
      description ? "",
      example ? null,
      ...
    }:
    if type == null then
      # Nested plugin config (recursive)
      mkPlugin _name setting
    else
      lib.options.mkOption (
        {
          inherit description;
          type = if type == "types.enum" then lib.types.enum (setting.enumValues or [ ]) else typeMap.${type};
        }
        // lib.attrsets.optionalAttrs (setting ? default) {
          default = resolveDefault type setting.default;
        }
        // lib.attrsets.optionalAttrs (example != null) { inherit example; }
      );

  mkPlugin =
    _name:
    {
      description ? "",
      settings ? { },
      ...
    }:
    {
      enable = lib.options.mkEnableOption description;
    }
    // lib.attrsets.mapAttrs mkSettingOption settings;
in
lib.attrsets.mapAttrs mkPlugin schema
