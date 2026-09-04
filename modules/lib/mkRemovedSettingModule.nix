# mkRemovedSettingModule :: [ string ] -> NixOS module
#
# Generates a backward-compatible shim for a setting that was removed
# upstream. The shim accepts (and ignores) the old option, and emits a warning
# when the user still defines it.
{ settingPath }:
{ config, lib, ... }:
let
  optionPath = [
    "programs"
    "nixcord"
    "config"
    "plugins"
  ]
  ++ settingPath;
  settingValue = lib.attrsets.attrByPath optionPath null config;
  settingName = lib.strings.concatStringsSep "." settingPath;
in
{
  options = lib.attrsets.setAttrByPath optionPath (
    lib.options.mkOption {
      type = lib.types.nullOr lib.types.anything;
      default = null;
      visible = false;
      description = "REMOVED: Plugin setting '${settingName}' was removed upstream.";
    }
  );
  config.warnings =
    lib.lists.optional (settingValue != null)
      "Plugin setting '${settingName}' has been removed upstream and is ignored. Please remove it from your nixcord configuration. This shim will be removed soon.";
}
