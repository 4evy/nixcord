{ lib }:
let
  inherit (import ./schema.nix { inherit lib; })
    isPluginEnabled
    schemaHasOptionPath
    sharedPlugins
    vencordPlugins
    equicordPlugins
    clientSchemaFor
    clientHasOptionPath
    getEnabledClients
    ;

  mkPluginKit =
    { cfg, mkVencordCfg }:
    let
      sharedPluginNames = builtins.attrNames sharedPlugins;
      vencordPluginNames = builtins.attrNames vencordPlugins;
      equicordPluginNames = builtins.attrNames equicordPlugins;

      deprecated = lib.trivial.importJSON ../../plugins/deprecated.json;
      migrations = lib.trivial.importJSON ../../plugins/migrations.json;

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
      normalizePlugins = config: pluginsOf (mkVencordCfg config);
      pluginName =
        name:
        builtins.head (
          builtins.attrNames (normalizePlugins {
            plugins.${name}.enable = true;
          })
        );

      mergePlugins =
        configs:
        lib.trivial.pipe configs [
          (map pluginsOf)
          (lib.lists.foldl' lib.attrsets.recursiveUpdate { })
        ];

      # Independent client overrides must not hide each other's enabled plugins
      clientConfigsFor =
        baseConfig:
        let
          sharedPluginConfig = mergePlugins [
            baseConfig
            cfg.extraConfig
          ];
        in
        map
          (
            clientConfig:
            mkVencordCfg {
              plugins = lib.attrsets.recursiveUpdate sharedPluginConfig (pluginsOf clientConfig);
            }
          )
          (
            lib.lists.optional (cfg.discord.enable && cfg.discord.vencord.enable) cfg.vencordConfig
            ++ lib.lists.optional (cfg.discord.enable && cfg.discord.equicord.enable) cfg.equicordConfig
            ++ lib.lists.optional cfg.vesktop.enable cfg.vesktopConfig
            ++ lib.lists.optional cfg.equibop.enable cfg.equibopConfig
            ++ lib.lists.optional cfg.goofcord.enable cfg.goofcordConfig
            ++ lib.lists.optional cfg.legcord.enable { }
            ++ lib.lists.optional cfg.dorion.enable { }
          )
        ++ lib.lists.optional cfg.browser.enable {
          plugins = mergePlugins (
            map mkVencordCfg [
              baseConfig
              cfg.extraConfig
              cfg.browser.extraConfig
            ]
          );
        };

      clientConfigs = clientConfigsFor cfg.config;
      freeformClientConfigs = clientConfigsFor { };

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
              !(lib.attrsets.hasAttrByPath migration.from plugins)
              || clientHasOptionPath client migration.from
              || !(clientHasOptionPath client migration.to)
            then
              plugins
            else
              migrateAttrByPath migration.from migration.to plugins;
          migratedConfig = migrateDeprecatedPluginNamesFor clientSchema configAttrs;
          plugins = lib.lists.foldl' migrateOption (pluginsOf migratedConfig) (
            migrations.renames ++ (migrations.identifierRenames or [ ]) ++ (migrations.clientRenames or [ ])
          );
        in
        if pluginsOf configAttrs == { } then configAttrs else migratedConfig // { inherit plugins; };

      collectDeprecatedPlugins =
        configAttrs:
        let
          plugins = pluginsOf configAttrs;
        in
        lib.trivial.pipe pluginNameMigrations [
          (lib.attrsets.filterAttrs (
            oldName: newName:
            pluginName oldName != pluginName newName && isPluginEnabled (plugins.${pluginName oldName} or null)
          ))
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
        builtins.filter (name: isPluginEnabled ((pluginsOf configAttrs).${pluginName name} or null)) (
          builtins.attrNames exclusiveMask
        );

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

      # Several clients consume the same filtered base config
      baseConfigs = lib.attrsets.genAttrs [ "none" "vencord" "equicord" ] (
        client: filterPluginsFor client cfg.config
      );

      mkFullConfig =
        args@{
          baseConfig ? cfg.config,
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
          filteredBaseConfig =
            if args ? baseConfig then
              filterPluginsFor effectiveClient baseConfig
            else
              baseConfigs.${effectiveClient} or baseConfigs.none;
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
        clientConfigs
        freeformClientConfigs
        pluginNameMigrations
        pluginName
        collectDeprecatedPlugins
        collectEnabledEquicordOnlyPlugins
        collectEnabledVencordOnlyPlugins
        filterPluginsFor
        migrateFreeformConfigFor
        mkFullConfig
        ;
    };

in
{
  inherit isPluginEnabled schemaHasOptionPath mkPluginKit;
  inherit (import ./assertions.nix { inherit lib; }) mkAssertions;
}
