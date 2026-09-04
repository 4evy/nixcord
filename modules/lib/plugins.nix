{ lib, ... }:
let
  isPluginEnabled =
    pluginConfig: builtins.isAttrs pluginConfig && pluginConfig ? enable && pluginConfig.enable;

  mkPluginKit =
    cfg:
    let
      sharedPlugins = lib.trivial.importJSON ../plugins/shared.json;
      vencordPlugins = lib.trivial.importJSON ../plugins/vencord.json;
      equicordPlugins = lib.trivial.importJSON ../plugins/equicord.json;

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

      removeAttrByPath =
        path: attrs:
        let
          name = builtins.head path;
          rest = builtins.tail path;
        in
        if rest == [ ] then
          lib.attrsets.removeAttrs attrs [ name ]
        else if builtins.hasAttr name attrs && builtins.isAttrs attrs.${name} then
          attrs // { ${name} = removeAttrByPath rest attrs.${name}; }
        else
          attrs;

      schemaHasOptionPath =
        schema: path:
        let
          pluginName = builtins.head path;
          settingPath = builtins.tail path;
          plugin = schema.${pluginName} or null;
          hasSettingPath =
            setting: remaining:
            if remaining == [ ] then
              true
            else
              let
                child = lib.attrsets.attrByPath [ "settings" (builtins.head remaining) ] null setting;
              in
              child != null && hasSettingPath child (builtins.tail remaining);
        in
        plugin != null
        && (settingPath == [ "enable" ] || (settingPath != [ ] && hasSettingPath plugin settingPath));

      clientSchemasFor =
        client:
        [ sharedPlugins ]
        ++ lib.lists.optional (client == "vencord") vencordPlugins
        ++ lib.lists.optional (client == "equicord") equicordPlugins;

      clientSchemaFor =
        client: lib.lists.foldl' lib.attrsets.recursiveUpdate { } (clientSchemasFor client);

      clientHasOptionPath =
        client: path: lib.lists.any (schema: schemaHasOptionPath schema path) (clientSchemasFor client);

      filterPluginAttrs =
        schema: attrs:
        let
          settingSchemas = schema.settings or { };
          allowedNames = [ "enable" ] ++ builtins.attrNames settingSchemas;
          filtered = builtins.intersectAttrs (lib.attrsets.genAttrs allowedNames (_: null)) attrs;
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
          oldValue = lib.attrsets.getAttrFromPath from attrs;
          newValue = lib.attrsets.attrByPath to oldValue attrs;
          mergedValue =
            if builtins.isAttrs oldValue && builtins.isAttrs newValue then
              lib.attrsets.recursiveUpdate oldValue newValue
            else
              newValue;
        in
        lib.attrsets.recursiveUpdate (removeAttrByPath from attrs) (
          lib.attrsets.setAttrByPath to mergedValue
        );

      migrateDeprecatedPluginNamesFor =
        clientPluginNames: configAttrs:
        let
          migratePlugin =
            plugins: oldName:
            let
              newName = allDeprecatedPluginNameMigrations.${oldName};
            in
            if
              builtins.elem oldName clientPluginNames
              || !(builtins.elem newName clientPluginNames)
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
          clientPluginNames = builtins.attrNames (clientSchemaFor client);
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
          migratedConfig = migrateDeprecatedPluginNamesFor clientPluginNames configAttrs;
          plugins = lib.trivial.pipe (pluginsOf migratedConfig) [
            (
              plugins:
              lib.lists.foldl' migrateOption plugins (
                migrations.renames ++ (migrations.identifierRenames or [ ]) ++ (migrations.clientRenames or [ ])
              )
            )
          ];
        in
        migratedConfig // { inherit plugins; };

      collectDeprecatedPlugins =
        configAttrs:
        let
          plugins = pluginsOf configAttrs;
        in
        lib.trivial.pipe pluginNameMigrations [
          (lib.attrsets.filterAttrs (
            oldName: _:
            let
              plugin = plugins.${oldName} or null;
            in
            plugin != null && isPluginEnabled plugin
          ))
          lib.attrsets.attrNames
        ];

      sharedMask = lib.attrsets.genAttrs sharedPluginNames (_: null);
      vencordMask = lib.attrsets.genAttrs vencordPluginNames (_: null);
      equicordMask = lib.attrsets.genAttrs equicordPluginNames (_: null);

      vencordOnlyMask = lib.attrsets.removeAttrs vencordMask (sharedPluginNames ++ equicordPluginNames);
      equicordOnlyMask = lib.attrsets.removeAttrs equicordMask (sharedPluginNames ++ vencordPluginNames);

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
        lib.trivial.pipe
          [
            filteredBaseConfig
            (migrateFreeformConfigFor effectiveClient extraConfig)
            (migrateFreeformConfigFor effectiveClient clientConfig)
          ]
          [ (lib.lists.foldl' lib.attrsets.recursiveUpdate { }) ];
    in
    {
      inherit
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
    {
      cfg,
      mergePlugins,
      collectEnabledEquicordOnlyPlugins,
      collectEnabledVencordOnlyPlugins,
    }:
    let
      allPlugins.plugins = mergePlugins [
        cfg.config
        cfg.extraConfig
        cfg.vencordConfig
        cfg.equicordConfig
        cfg.vesktopConfig
        cfg.equibopConfig
        cfg.goofcordConfig
      ];
      wrongEquicordPlugins = collectEnabledEquicordOnlyPlugins allPlugins;
      wrongVencordPlugins = collectEnabledVencordOnlyPlugins allPlugins;
      hasVencordClient =
        cfg.discord.vencord.enable
        || cfg.vesktop.enable
        || cfg.legcord.vencord.enable
        || (cfg.goofcord.enable && cfg.goofcord.clientMod == "vencord");
      hasEquicordClient =
        cfg.discord.equicord.enable
        || cfg.equibop.enable
        || cfg.legcord.equicord.enable
        || (cfg.goofcord.enable && cfg.goofcord.clientMod == "equicord");
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
        assertion =
          !cfg.goofcord.enable
          || !(cfg.goofcord.settings ? assets)
          || builtins.isAttrs cfg.goofcord.settings.assets;
        message = "programs.nixcord.goofcord.settings.assets must be an attribute set. Use programs.nixcord.goofcord.extraAssets for additional asset paths or URLs.";
      }
      {
        assertion =
          !cfg.goofcord.enable
          || !(cfg.goofcord.settings ? assets)
          || !builtins.isAttrs cfg.goofcord.settings.assets
          || builtins.all builtins.isString (builtins.attrValues cfg.goofcord.settings.assets);
        message = "programs.nixcord.goofcord.settings.assets values must be strings containing local paths or URLs.";
      }
      {
        assertion = !(hasVencordClient && !hasEquicordClient) || wrongEquicordPlugins == [ ];
        message = "The following Equicord-only plugins are enabled but only Vencord-based clients are active: ${lib.strings.concatStringsSep ", " wrongEquicordPlugins}. These plugins are not available in Vencord.";
      }
      {
        assertion = !(hasEquicordClient && !hasVencordClient) || wrongVencordPlugins == [ ];
        message = "The following Vencord-only plugins are enabled but only Equicord-based clients are active: ${lib.strings.concatStringsSep ", " wrongVencordPlugins}. These plugins are not available in Equicord.";
      }
    ];
in
{
  inherit isPluginEnabled mkPluginKit mkAssertions;
}
