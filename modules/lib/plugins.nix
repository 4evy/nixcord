{ lib, ... }:
let
  isPluginEnabled = pluginConfig: builtins.isAttrs pluginConfig && (pluginConfig.enable or false);

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

  sharedPlugins = lib.trivial.importJSON ../plugins/shared.json;
  vencordPlugins = lib.trivial.importJSON ../plugins/vencord.json;
  equicordPlugins = lib.trivial.importJSON ../plugins/equicord.json;

  clientSchemasFor =
    client:
    [ sharedPlugins ]
    ++ lib.lists.optional (client == "vencord") vencordPlugins
    ++ lib.lists.optional (client == "equicord") equicordPlugins;

  clientSchemaFor =
    client: lib.lists.foldl' lib.attrsets.recursiveUpdate { } (clientSchemasFor client);

  clientHasOptionPath =
    client: path: lib.lists.any (schema: schemaHasOptionPath schema path) (clientSchemasFor client);

  # Compatibility checks cover the clients whose mod config we manage.
  # Dorion's browser bootstrap is handled separately by migration callers.
  getEnabledClients =
    cfg:
    lib.attrsets.attrNames (
      lib.attrsets.filterAttrs
        (
          client: standaloneEnabled:
          cfg.discord.${client}.enable
          || cfg.legcord.${client}.enable
          || standaloneEnabled
          || (cfg.goofcord.enable && cfg.goofcord.clientMod == client)
        )
        {
          vencord = cfg.vesktop.enable;
          equicord = cfg.equibop.enable;
        }
    );

  mkPluginKit =
    cfg:
    let
      sharedPluginNames = builtins.attrNames sharedPlugins;
      vencordPluginNames = builtins.attrNames vencordPlugins;
      equicordPluginNames = builtins.attrNames equicordPlugins;

      deprecated = lib.trivial.importJSON ../plugins/deprecated.json;
      migrations = lib.trivial.importJSON ../plugins/migrations.json;

      activePluginNames = sharedPluginNames ++ vencordPluginNames ++ equicordPluginNames;
      activePluginNamesByLowercase = lib.attrsets.genAttrs' activePluginNames (
        name: lib.attrsets.nameValuePair (lib.strings.toLower name) name
      );
      allDeprecatedPluginNameMigrations = lib.attrsets.mapAttrs (
        _: value: activePluginNamesByLowercase.${lib.strings.toLower value.to} or value.to
      ) deprecated.renames;
      deprecatedPluginNameMigrations = lib.attrsets.filterAttrs (
        oldName: newName: oldName != newName
      ) allDeprecatedPluginNameMigrations;
      generatedPluginNameMigrations = lib.trivial.pipe migrations.renames [
        (lib.lists.filter (
          migration:
          builtins.length migration.from == 2
          && builtins.elemAt migration.from 1 == "enable"
          && builtins.length migration.to >= 1
        ))
        (
          migrations:
          lib.attrsets.genAttrs' migrations (
            migration:
            lib.attrsets.nameValuePair (builtins.elemAt migration.from 0) (builtins.elemAt migration.to 0)
          )
        )
      ];

      pluginsOf = attrs: attrs.plugins or { };

      mergePlugins =
        configs:
        lib.trivial.pipe configs [
          (map pluginsOf)
          (lib.lists.foldl' lib.attrsets.recursiveUpdate { })
        ];

      pluginNameMigrations = deprecatedPluginNameMigrations // generatedPluginNameMigrations;

      filterPluginAttrs =
        schema: attrs:
        let
          settingSchemas = schema.settings or { };
          filtered = builtins.intersectAttrs (settingSchemas // { enable = null; }) attrs;
        in
        lib.attrsets.mapAttrs (
          name: value:
          if
            name != "enable"
            && builtins.isAttrs value
            && builtins.hasAttr name settingSchemas
            && settingSchemas.${name} ? settings
          then
            filterPluginAttrs settingSchemas.${name} value
          else
            value
        ) filtered;

      migrateAttrByPath =
        from: to: attrs:
        let
          # The caller has checked that the source path exists
          withoutOld = lib.attrsets.updateManyAttrsByPath [
            {
              path = lib.lists.init from;
              update = parent: lib.attrsets.removeAttrs parent [ (lib.lists.last from) ];
            }
          ] attrs;
          oldValue = lib.attrsets.getAttrFromPath from attrs;
          newValue = lib.attrsets.attrByPath to oldValue attrs;
          mergedValue =
            if builtins.isAttrs oldValue && builtins.isAttrs newValue then
              lib.attrsets.recursiveUpdate oldValue newValue
            else
              newValue;
        in
        lib.attrsets.recursiveUpdate withoutOld (lib.attrsets.setAttrByPath to mergedValue);

      migrateDeprecatedPluginNamesFor =
        clientSchema: configAttrs:
        let
          migratePlugin =
            plugins: oldName:
            let
              newName = allDeprecatedPluginNameMigrations.${oldName};
            in
            if
              builtins.hasAttr oldName clientSchema
              || !(builtins.hasAttr newName clientSchema)
              || !(builtins.hasAttr oldName plugins)
            then
              plugins
            else
              let
                oldValue = plugins.${oldName};
                newValue = plugins.${newName} or oldValue;
                mergedValue =
                  if builtins.isAttrs oldValue && builtins.isAttrs newValue then
                    lib.attrsets.recursiveUpdate oldValue newValue
                  else
                    newValue;
              in
              lib.attrsets.removeAttrs (plugins // { ${newName} = mergedValue; }) [ oldName ];
        in
        configAttrs
        // {
          plugins = lib.lists.foldl' migratePlugin (pluginsOf configAttrs) (
            builtins.attrNames allDeprecatedPluginNameMigrations
          );
        };

      migrateFreeformConfigFor =
        client: configAttrs:
        let
          clientSchema = clientSchemaFor client;
          migrateOption =
            plugins: migration:
            if
              clientHasOptionPath client migration.from
              || !(clientHasOptionPath client migration.to)
              || !(lib.attrsets.hasAttrByPath migration.from plugins)
            then
              plugins
            else
              migrateAttrByPath migration.from migration.to plugins;
          migratedConfig = migrateDeprecatedPluginNamesFor clientSchema configAttrs;
          plugins = lib.lists.foldl' migrateOption (pluginsOf migratedConfig) (
            migrations.renames ++ (migrations.identifierRenames or [ ]) ++ (migrations.clientRenames or [ ])
          );
        in
        migratedConfig // { inherit plugins; };

      collectDeprecatedPlugins =
        configAttrs:
        let
          plugins = pluginsOf configAttrs;
        in
        lib.trivial.pipe pluginNameMigrations [
          (lib.attrsets.filterAttrs (oldName: _: isPluginEnabled (plugins.${oldName} or null)))
          lib.attrsets.attrNames
        ];

      vencordOnlyMask = lib.attrsets.removeAttrs vencordPlugins (
        sharedPluginNames ++ equicordPluginNames
      );
      equicordOnlyMask = lib.attrsets.removeAttrs equicordPlugins (
        sharedPluginNames ++ vencordPluginNames
      );

      collectEnabledExclusivePlugins =
        exclusiveMask: configAttrs:
        lib.trivial.pipe (builtins.intersectAttrs exclusiveMask (pluginsOf configAttrs)) [
          (lib.attrsets.filterAttrs (_: isPluginEnabled))
          builtins.attrNames
        ];

      collectEnabledEquicordOnlyPlugins = collectEnabledExclusivePlugins equicordOnlyMask;
      collectEnabledVencordOnlyPlugins = collectEnabledExclusivePlugins vencordOnlyMask;

      filterPluginsFor =
        client: configAttrs:
        let
          schema = clientSchemaFor client;
          plugins = lib.attrsets.mapAttrs (name: filterPluginAttrs schema.${name}) (
            builtins.intersectAttrs schema (pluginsOf configAttrs)
          );
        in
        configAttrs // { inherit plugins; };

      mkFullConfig =
        {
          baseConfig,
          extraConfig ? { },
          clientConfig ? { },
          client ? null,
        }:
        let
          effectiveClient =
            if client != null then
              client
            else if cfg.discord.vencord.enable then
              "vencord"
            else if cfg.discord.equicord.enable then
              "equicord"
            else
              "none";
          filteredBaseConfig = filterPluginsFor effectiveClient baseConfig;
        in
        lib.lists.foldl' lib.attrsets.recursiveUpdate { } [
          filteredBaseConfig
          (migrateFreeformConfigFor effectiveClient extraConfig)
          (migrateFreeformConfigFor effectiveClient clientConfig)
        ];
    in
    {
      enabledClients = getEnabledClients cfg;

      inherit
        clientHasOptionPath
        isPluginEnabled
        pluginsOf
        mergePlugins
        pluginNameMigrations
        collectDeprecatedPlugins
        collectEnabledEquicordOnlyPlugins
        collectEnabledVencordOnlyPlugins
        filterPluginsFor
        mkFullConfig
        ;
    };

  mkAssertions =
    cfg: pluginKit:
    let
      inherit (pluginKit)
        enabledClients
        mergePlugins
        collectEnabledEquicordOnlyPlugins
        collectEnabledVencordOnlyPlugins
        ;
      allPlugins.plugins = mergePlugins [
        cfg.config
        cfg.extraConfig
        cfg.vencordConfig
        cfg.equicordConfig
        cfg.vesktopConfig
        cfg.equibopConfig
        cfg.goofcordConfig
      ];
      goofcordAssets = cfg.goofcord.settings.assets or { };
      wrongEquicordPlugins = collectEnabledEquicordOnlyPlugins allPlugins;
      wrongVencordPlugins = collectEnabledVencordOnlyPlugins allPlugins;
    in
    [
      {
        assertion = !(cfg.discord.vencord.enable && cfg.discord.equicord.enable);
        message = "programs.nixcord.discord.vencord.enable and programs.nixcord.discord.equicord.enable cannot both be enabled at the same time. They are mutually exclusive.";
      }
      {
        assertion = !(cfg.legcord.vencord.enable && cfg.legcord.equicord.enable);
        message = "programs.nixcord.legcord.vencord.enable and programs.nixcord.legcord.equicord.enable cannot both be enabled at the same time. They are mutually exclusive.";
      }
      {
        assertion = !cfg.goofcord.enable || cfg.goofcord.package != null;
        message = "programs.nixcord.goofcord.enable requires programs.nixcord.goofcord.package to be non-null.";
      }
      {
        assertion = !cfg.goofcord.enable || builtins.isAttrs goofcordAssets;
        message = "programs.nixcord.goofcord.settings.assets must be an attribute set. Use programs.nixcord.goofcord.extraAssets for additional asset paths or URLs.";
      }
      {
        assertion =
          !cfg.goofcord.enable
          || !builtins.isAttrs goofcordAssets
          || builtins.all builtins.isString (builtins.attrValues goofcordAssets);
        message = "programs.nixcord.goofcord.settings.assets values must be strings containing local paths or URLs.";
      }
      {
        assertion = enabledClients != [ "vencord" ] || wrongEquicordPlugins == [ ];
        message = "The following Equicord-only plugins are enabled but only Vencord-based clients are active: ${lib.strings.concatStringsSep ", " wrongEquicordPlugins}. These plugins are not available in Vencord.";
      }
      {
        assertion = enabledClients != [ "equicord" ] || wrongVencordPlugins == [ ];
        message = "The following Vencord-only plugins are enabled but only Equicord-based clients are active: ${lib.strings.concatStringsSep ", " wrongVencordPlugins}. These plugins are not available in Equicord.";
      }
    ];
in
{
  inherit
    isPluginEnabled
    schemaHasOptionPath
    mkPluginKit
    mkAssertions
    ;
}
