# Builds NixOS module options from a plugin JSON schema.
# Each plugin gets an `enable` option plus any declared settings.
{ lib, file, ... }:
let
  inherit (lib)
    types
    mkEnableOption
    mkOption
    mapAttrs
    ;

  # Map type strings from the JSON schema to actual Nix types.
  typeMap = {
    "types.bool" = types.bool;
    "types.str" = types.str;
    "types.int" = types.int;
    "types.float" = types.float;
    "types.attrs" = types.attrs;
    "types.nullOr types.str" = types.nullOr types.str;
    "types.nullOr types.attrs" = types.nullOr types.attrs;
    "types.nullOr (types.listOf types.str)" = types.nullOr (types.listOf types.str);
    "types.listOf types.str" = types.listOf types.str;
    "types.listOf types.attrs" = types.listOf types.attrs;
  };

  normalizeSetting =
    setting:
    let
      normalized = {
        description = "";
        example = null;
        type = null;
        settings = { };
      }
      // setting;
    in
    normalized // { settings = mapAttrs (_: normalizeSetting) normalized.settings; };

  data = mapAttrs (_: normalizeSetting) (lib.importJSON file);

  resolveDefault =
    value:
    if builtins.isAttrs value && builtins.attrNames value == [ "__nixRaw" ] then
      # Raw Nix expressions serialized as { __nixRaw = "1.0"; }
      builtins.fromJSON value.__nixRaw
    else
      value;

  mkSettingOption =
    _name: setting:
    if setting.type == null then
      # Nested plugin config (recursive)
      mkPlugin _name setting
    else
      let
        commonAttrs = {
          default = resolveDefault setting.default;
          description = setting.description;
        }
        // lib.optionalAttrs (setting.example != null) { example = setting.example; };
        typeAttr =
          if setting.type == "types.enum" then
            { type = types.enum setting.enumValues; }
          else
            { type = typeMap.${setting.type}; };
      in
      mkOption (typeAttr // commonAttrs);

  mkPlugin =
    _name: plugin:
    {
      enable = mkEnableOption plugin.description;
    }
    // mapAttrs mkSettingOption plugin.settings;
in
mapAttrs mkPlugin data
