{ lib }:
let
  isPluginEnabled =
    pluginConfig:
    builtins.isAttrs pluginConfig && (pluginConfig.enable or pluginConfig.enabled or false);

  schemaHasOptionPath =
    schema: path:
    let
      plugin = schema.${builtins.head path} or null;
      settingPath = builtins.tail path;
      schemaPath = lib.lists.concatMap (name: [
        "settings"
        name
      ]) settingPath;
    in
    plugin != null
    && (
      settingPath == [ "enable" ]
      || (settingPath != [ ] && lib.attrsets.attrByPath schemaPath null plugin != null)
    );

  # Filtering and migration checks only need names and nesting, not defaults
  paths = import ../../plugins/schema/schema.nix;
  sharedPlugins = paths.shared;
  vencordPlugins = paths.vencord;
  equicordPlugins = paths.equicord;

  mergePlugin = lib.attrsets.recursiveUpdateUntil (
    _: left: right:
    !(builtins.isAttrs left && builtins.isAttrs right) || left ? type || right ? type
  );
  mergeSchemas = lib.attrsets.zipAttrsWith (_: lib.lists.foldl' mergePlugin { });

  clientSchemasFor =
    client:
    [ sharedPlugins ]
    ++ lib.lists.optional (client == "vencord") vencordPlugins
    ++ lib.lists.optional (client == "equicord") equicordPlugins;

  # Share merged client schemas across settings files and migration checks
  clientSchemas = {
    none = sharedPlugins;
    vencord = mergeSchemas [
      sharedPlugins
      vencordPlugins
    ];
    equicord = mergeSchemas [
      sharedPlugins
      equicordPlugins
    ];
  };
  clientSchemaFor = client: clientSchemas.${client} or sharedPlugins;

  clientHasOptionPath =
    client: path: lib.lists.any (schema: schemaHasOptionPath schema path) (clientSchemasFor client);

  # Compatibility checks cover the clients whose mod config we manage
  # Dorion's browser bootstrap is handled separately by migration callers
  getEnabledClients =
    cfg:
    lib.attrsets.attrNames (
      lib.attrsets.filterAttrs
        (
          client: standaloneEnabled:
          (cfg.discord.enable && cfg.discord.${client}.enable)
          || (cfg.legcord.enable && cfg.legcord.${client}.enable)
          || standaloneEnabled
          || (cfg.goofcord.enable && cfg.goofcord.clientMod == client)
          || (cfg.browser.enable && cfg.browser.client == client)
        )
        {
          vencord = cfg.vesktop.enable;
          equicord = cfg.equibop.enable;
        }
    );

in
{
  inherit
    isPluginEnabled
    schemaHasOptionPath
    sharedPlugins
    vencordPlugins
    equicordPlugins
    clientSchemaFor
    clientHasOptionPath
    getEnabledClients
    ;
}
