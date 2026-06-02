# mkRemovedPluginModule :: string -> NixOS module
#
# Generates a backward-compatible shim for a plugin that was removed
# upstream. The shim accepts (and ignores) the old option, and emits a
# warning when the user still has `enable = true`.
{ lib }:
pluginName:
{ config, ... }:
let
  pluginConfig = config.programs.nixcord.config.plugins.${pluginName};
  pluginEnabled = builtins.isAttrs pluginConfig && pluginConfig ? enable && pluginConfig.enable;
in
{
  options.programs.nixcord.config.plugins.${pluginName} = lib.mkOption {
    type = lib.types.anything;
    default = { };
    visible = false;
    description = "REMOVED: Plugin '${pluginName}' was removed upstream.";
  };
  config.warnings = lib.optional pluginEnabled "Plugin '${pluginName}' has been removed upstream. Please remove it from your nixcord configuration. This shim will be removed soon.";
}
