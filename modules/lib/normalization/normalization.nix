{ lib, parseRules }:
let
  inherit (import ./casing.nix { inherit lib; }) toSnakeCase;

  defaultParseRules = lib.trivial.importJSON ../../plugins/parse-rules.json;

  upperNames = defaultParseRules.upperNames ++ parseRules.upperNames;
  upperNamesMask = lib.attrsets.genAttrs upperNames (_: null);
  lowerPluginTitles = defaultParseRules.lowerPluginTitles ++ parseRules.lowerPluginTitles;
  lowerPluginTitlesMask = lib.attrsets.genAttrs lowerPluginTitles (_: null);
  settingRenames = lib.attrsets.recursiveUpdate defaultParseRules.settingRenames parseRules.settingRenames;
  pluginRenames = lib.attrsets.recursiveUpdate (defaultParseRules.pluginRenames or { }) (
    parseRules.pluginRenames or { }
  );

  isLowerCase = s: lib.strings.toLower s == s;

  unNixify = nixName: lib.strings.toUpper (toSnakeCase nixName);

  isLowerCamel = string: isLowerCase (builtins.substring 0 1 string);

  toUpper =
    string:
    lib.strings.concatStrings [
      (lib.strings.toUpper (builtins.substring 0 1 string))
      (builtins.substring 1 (builtins.stringLength string) string)
    ];

  specialRenames = {
    enable = "enabled";
    tagSettings = "tagSettings";
    useQuickCss = "useQuickCSS";
    webRichPresence = "WebRichPresence (arRPC)";
    _24hTime = "24h Time";
    showOwnTimezone = "Show Own Timezone";
  };

  # mkNormalizeName :: string -> (string -> value -> string)
  # Convert Nix option names to upstream JSON keys using the current plugin
  # or settings context and the configured rename rules
  mkNormalizeName =
    context:
    let
      contextRenames = settingRenames.${context} or { };
      pluginContext = context == "plugins";
    in
    name: value:
    let
      specialName = specialRenames.${name} or null;
      renamedSetting = contextRenames.${name} or null;
      pluginRename = pluginRenames.${name} or null;
    in
    if specialName != null then
      specialName
    else if renamedSetting != null then
      renamedSetting
    else if pluginContext && pluginRename != null then
      pluginRename
    else if builtins.hasAttr name upperNamesMask then
      unNixify name
    else if builtins.hasAttr name lowerPluginTitlesMask then
      name
    else if pluginContext && builtins.isAttrs value && value ? enable && isLowerCamel name then
      toUpper name
    else
      name;

  # mkVencordCfgInner :: string -> attrset -> attrset
  # Recursively transforms Nix option names to their JSON counterparts
  mkVencordCfgInner =
    context: cfg:
    let
      normalizeName = mkNormalizeName context;
    in
    lib.attrsets.mapAttrs' (
      name: value:
      let
        normalizedValue = if builtins.isAttrs value then mkVencordCfgInner name value else value;
      in
      lib.attrsets.nameValuePair (normalizeName name value) normalizedValue
    ) cfg;

  mkVencordCfg = mkVencordCfgInner "";

in
{
  inherit mkVencordCfg;
}
