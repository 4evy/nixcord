# mkRemovedPluginModule :: string -> NixOS module
#
# Generates a backward-compatible shim for a plugin that was removed
# upstream. The shim accepts (and ignores) the old option, and emits a
# warning when the user still has `enable = true`.
{ pluginName }:
{ config, lib, ... }:
let
  inherit (import ./plugins.nix { inherit lib; }) isPluginEnabled;

  pluginConfig = config.programs.nixcord.config.plugins.${pluginName};
  pluginEnabled = isPluginEnabled pluginConfig;
in
{
  options.programs.nixcord.config.plugins.${pluginName} = lib.options.mkOption {
    type = lib.types.anything;
    default = { };
    visible = false;
    description = "REMOVED: Plugin '${pluginName}' was removed upstream.";
  };
  config.warnings = lib.lists.optional pluginEnabled "Plugin '${pluginName}' has been removed upstream. Please remove it from your nixcord configuration. This shim will be removed soon.";
}
