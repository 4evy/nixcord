{ lib, ... }:
let
  isPluginEnabled =
    pluginConfig: builtins.isAttrs pluginConfig && pluginConfig ? enable && pluginConfig.enable;

  mkPluginKit =
    cfg:
    let
      sharedPluginNames = builtins.attrNames (lib.trivial.importJSON ../plugins/shared.json);
      vencordPluginNames = builtins.attrNames (lib.trivial.importJSON ../plugins/vencord.json);
      equicordPluginNames = builtins.attrNames (lib.trivial.importJSON ../plugins/equicord.json);

      deprecated = lib.trivial.importJSON ../plugins/deprecated.json;
      migrations = lib.trivial.importJSON ../plugins/migrations.json;

      activePluginNames = sharedPluginNames ++ vencordPluginNames ++ equicordPluginNames;
      activePluginNamesByLowercase = lib.attrsets.genAttrs' activePluginNames (
        name: lib.attrsets.nameValuePair (lib.strings.toLower name) name
      );

      deprecatedPluginNameMigrations = lib.attrsets.filterAttrs (oldName: newName: oldName != newName) (
        lib.attrsets.mapAttrs (
          _: value: activePluginNamesByLowercase.${lib.strings.toLower value.to} or value.to
        ) deprecated.renames
      );
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
          mask =
            sharedMask
            // (
              if client == "vencord" then
                vencordMask
              else if client == "equicord" then
                equicordMask
              else
                { }
            );
          plugins = pluginsOf configAttrs;
        in
        configAttrs // { plugins = builtins.intersectAttrs mask plugins; };

      mkFullConfig =
        {
          baseConfig,
          extraConfig ? { },
          clientConfig ? { },
          client ? null,
        }:
        let
          filteredBaseConfig =
            if client != null then
              filterPluginsFor client baseConfig
            else
              filterPluginsFor (
                if cfg.discord.vencord.enable then
                  "vencord"
                else if cfg.discord.equicord.enable then
                  "equicord"
                else
                  "none"
              ) baseConfig;
        in
        lib.trivial.pipe
          [
            filteredBaseConfig
            extraConfig
            clientConfig
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
