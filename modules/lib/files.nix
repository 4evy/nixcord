{ lib, ... }:
let
  mkFileSpecs =
    {
      cfg,
      files,
      isQuickCssUsed,
    }:
    let
      inherit (files)
        quickCss
        settings
        themes
        dorionConfig
        legcordSettings
        legcordWeb
        ;
      inherit (cfg)
        configDir
        discord
        dorion
        equibop
        legcord
        vesktop
        ;
      inherit (cfg.discord) vencord equicord;

      copy =
        spec:
        {
          writable = false;
        }
        // spec;

      mkSettingsSpecs =
        {
          name,
          client,
          fullSettings,
          clientSettings,
          state,
          quickCssUsed,
        }:
        [
          (copy {
            name = "${name}-settings";
            inherit (client) enable;
            src = fullSettings;
            dest = "${client.configDir}/settings/settings.json";
          })
          (copy {
            name = "${name}-client-settings";
            enable = client.enable && clientSettings != null;
            src = clientSettings;
            dest = "${client.configDir}/settings.json";
          })
          (copy {
            name = "${name}-state";
            enable = client.enable && state != null;
            src = state;
            dest = "${client.configDir}/state.json";
          })
          (copy {
            name = "${name}-quick-css";
            enable = quickCssUsed;
            src = quickCss;
            dest = "${client.configDir}/settings/quickCss.css";
          })
        ];

      quickCssEnabled = cfg.quickCss != "";
      quickCssOnDiscord =
        cfg.discord.enable
        && quickCssEnabled
        && lib.any isQuickCssUsed [
          cfg.vencordConfig
          cfg.equicordConfig
        ];
      quickCssOnVesktop = cfg.vesktop.enable && quickCssEnabled && isQuickCssUsed cfg.vesktopConfig;
      quickCssOnEquibop = cfg.equibop.enable && quickCssEnabled && isQuickCssUsed cfg.equibopConfig;

      desktopClients = [
        {
          name = "vesktop";
          client = vesktop;
          fullSettings = settings.vesktopSettingsFile;
          clientSettings = settings.vesktopClientSettingsFile;
          state = settings.vesktopStateFile;
          quickCssUsed = quickCssOnVesktop;
        }
        {
          name = "equibop";
          client = equibop;
          fullSettings = settings.equibopSettingsFile;
          clientSettings = settings.equibopClientSettingsFile;
          state = settings.equibopStateFile;
          quickCssUsed = quickCssOnEquibop;
        }
      ];

      discordMods = [
        {
          name = "vencord";
          inherit (vencord) enable;
          src = settings.vencordSettingsFile;
        }
        {
          name = "equicord";
          inherit (equicord) enable;
          src = settings.equicordSettingsFile;
        }
      ];

      discordModSettingsSpecs = map (
        mod:
        copy {
          name = "${mod.name}-settings";
          enable = discord.enable && mod.enable;
          inherit (mod) src;
          dest = "${configDir}/settings/settings.json";
          writable = true;
        }
      ) discordMods;

      legcordWebMods = [
        {
          name = "vencord";
          build = legcordWeb.vencord;
        }
        {
          name = "equicord";
          build = legcordWeb.equicord;
        }
      ];

      legcordWebSpecs = lib.concatMap (
        mod:
        map
          (
            extension:
            copy {
              name = "legcord-${mod.name}-${extension}";
              enable = cfg.legcord.enable && mod.build != null;
              src = "${mod.build}/browser.${extension}";
              dest = "${cfg.legcord.configDir}/${mod.name}.${extension}";
            }
          )
          [
            "js"
            "css"
          ]
      ) legcordWebMods;

      themeClients = [
        {
          name = "vesktop";
          client = vesktop;
        }
        {
          name = "equibop";
          client = equibop;
        }
      ];

      themeSpecs = lib.concatMap (
        themeClient:
        lib.optionals themeClient.client.enable (
          lib.mapAttrsToList (
            themeName: path:
            copy {
              name = "${themeClient.name}-theme-${themeName}";
              enable = true;
              src = path;
              dest = "${themeClient.client.configDir}/themes/${themeName}.css";
            }
          ) themes
        )
      ) themeClients;

      oneOffSpecs = [
        (copy {
          name = "discord-quick-css";
          enable = quickCssOnDiscord;
          src = quickCss;
          dest = "${configDir}/settings/quickCss.css";
        })
        (copy {
          name = "discord-settings";
          enable = discord.enable && discord.settings != { };
          src = settings.discordSettingsFile;
          dest = "${discord.configDir}/settings.json";
          writable = true;
        })
        (copy {
          name = "dorion-config";
          enable = dorion.enable && dorionConfig != null;
          src = dorionConfig;
          dest = "${dorion.configDir}/config.json";
        })
        (copy {
          name = "legcord-settings";
          enable = legcord.enable && legcordSettings != null;
          src = legcordSettings;
          dest = "${legcord.configDir}/storage/settings.json";
          writable = true;
        })
      ];

      fileSpecs =
        oneOffSpecs
        ++ discordModSettingsSpecs
        ++ lib.concatMap mkSettingsSpecs desktopClients
        ++ legcordWebSpecs
        ++ themeSpecs;
    in
    lib.pipe fileSpecs [
      (lib.filter (spec: spec.enable))
      (map (spec: lib.removeAttrs spec [ "enable" ]))
    ];

  mkCopyCommands =
    args:
    let
      mkCopy = spec: "copy_file ${lib.escapeShellArg spec.src} ${lib.escapeShellArg spec.dest} 0644";
    in
    lib.pipe (mkFileSpecs args) [
      (lib.concatMapStringsSep "\n" mkCopy)
    ];

  mkInstalledPackages =
    cfg: finalPackages:
    let
      inherit (cfg)
        discord
        dorion
        equibop
        legcord
        vesktop
        ;
    in
    lib.pipe
      [
        {
          enable = discord.enable && discord.installPackage;
          package = finalPackages.discord;
        }
        {
          enable = vesktop.enable && vesktop.installPackage;
          package = finalPackages.vesktop;
        }
        {
          enable = equibop.enable && finalPackages.equibop != null && equibop.installPackage;
          package = finalPackages.equibop;
        }
        {
          enable = dorion.enable && dorion.installPackage;
          package = finalPackages.dorion;
        }
        {
          enable = legcord.enable && legcord.installPackage;
          package = finalPackages.legcord;
        }
      ]
      [
        (lib.filter (entry: entry.enable))
        (map (entry: entry.package))
      ];

  mkSettingsFiles =
    {
      pkgs,
      cfg,
      mkVencordCfg,
      vencordFullConfig,
      equicordFullConfig,
      vesktopFullConfig,
      equibopFullConfig,
    }:
    let
      jsonFormat = pkgs.formats.json { };
      disabledUpdateSettings = {
        SKIP_HOST_UPDATE = true;
        SKIP_MODULE_UPDATE = true;
        USE_NEW_UPDATER = false;
      };
      discordSettings = cfg.discord.settings // disabledUpdateSettings;

      settingSpecs = {
        vencordSettingsFile = {
          enable = true;
          name = "settings";
          value = vencordFullConfig;
        };
        equicordSettingsFile = {
          enable = true;
          name = "equicord-settings";
          value = equicordFullConfig;
        };
        discordSettingsFile = {
          enable = cfg.discord.settings != { };
          name = "discord-settings";
          value = discordSettings;
        };
        vesktopSettingsFile = {
          enable = true;
          name = "vesktop-settings";
          value = vesktopFullConfig;
        };
        vesktopClientSettingsFile = {
          enable = cfg.vesktop.settings != { };
          name = "vesktop-client-settings";
          value = cfg.vesktop.settings;
        };
        vesktopStateFile = {
          enable = cfg.vesktop.state != { };
          name = "vesktop-state";
          value = cfg.vesktop.state;
        };
        equibopSettingsFile = {
          enable = true;
          name = "equibop-settings";
          value = equibopFullConfig;
        };
        equibopClientSettingsFile = {
          enable = cfg.equibop.settings != { };
          name = "equibop-client-settings";
          value = cfg.equibop.settings;
        };
        equibopStateFile = {
          enable = cfg.equibop.state != { };
          name = "equibop-state";
          value = cfg.equibop.state;
        };
      };
    in
    lib.mapAttrs (
      _: spec:
      if spec.enable then
        jsonFormat.generate "nixcord-${spec.name}.json" (mkVencordCfg spec.value)
      else
        null
    ) settingSpecs;

  mkThemeFile =
    { pkgs }:
    name: value:
    if builtins.isPath value || lib.isStorePath value then
      value
    else
      pkgs.writeText "nixcord-theme-${name}.css" value;
in
{
  inherit
    mkFileSpecs
    mkCopyCommands
    mkInstalledPackages
    mkSettingsFiles
    mkThemeFile
    ;
}
