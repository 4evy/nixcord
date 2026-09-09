{ lib, ... }:
let
  inherit (import ./discord.nix { inherit lib; })
    disabledUpdateSettings
    getDiscordBranches
    getDiscordConfigDir
    ;

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
        goofcordSettings
        goofcordSupport
        ;
      inherit (cfg)
        configDir
        discord
        dorion
        goofcord
        legcord
        ;

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
        && lib.lists.any isQuickCssUsed [
          cfg.vencordConfig
          cfg.equicordConfig
        ];
      desktopClients = [
        "vesktop"
        "equibop"
      ];

      desktopSettingsSpecs = lib.lists.concatMap (
        name:
        mkSettingsSpecs {
          inherit name;
          client = cfg.${name};
          fullSettings = settings.${name + "SettingsFile"};
          clientSettings = settings.${name + "ClientSettingsFile"};
          state = settings.${name + "StateFile"};
          quickCssUsed = cfg.${name}.enable && quickCssEnabled && isQuickCssUsed cfg.${name + "Config"};
        }
      ) desktopClients;

      discordModSettingsSpecs =
        map
          (
            name:
            copy {
              name = "${name}-settings";
              enable = discord.enable && discord.${name}.enable;
              src = settings.${name + "SettingsFile"};
              dest = "${configDir}/settings/settings.json";
              writable = true;
            }
          )
          [
            "vencord"
            "equicord"
          ];

      legcordWebSpecs = lib.lists.concatLists (
        lib.attrsets.mapAttrsToList (
          name: build:
          map
            (
              extension:
              copy {
                name = "legcord-${name}-${extension}";
                enable = legcord.enable && build != null;
                src = "${build}/browser.${extension}";
                dest = "${legcord.configDir}/${name}.${extension}";
              }
            )
            [
              "js"
              "css"
            ]
        ) legcordWeb
      );

      goofcordAssetSpecs =
        let
          enabled = goofcord.enable && goofcordSupport != null;
          supportPath = path: if goofcordSupport != null then "${goofcordSupport}/${path}" else null;
        in
        map
          (
            asset:
            copy {
              enable = enabled;
              name = "goofcord-${asset.name}";
              src = asset.src;
              dest = "${goofcord.configDir}/assets/${asset.dest}";
            }
          )
          [
            {
              name = "pre-vencord";
              src = supportPath "preVencord.js";
              dest = "NixcordPreVencord.js";
            }
            {
              name = "post-vencord";
              src = supportPath "postVencord.js";
              dest = "NixcordPostVencord.js";
            }
            {
              name = "client-mod-js";
              src = supportPath "clientMod.js";
              dest = "NixcordClientMod.js";
            }
            {
              name = "client-mod-css";
              src = supportPath "clientMod.css";
              dest = "NixcordClientModStyles.css";
            }
            {
              name = "quick-css";
              src = supportPath "quickCss.css";
              dest = "NixcordQuickCSS.css";
            }
            {
              name = "themes";
              src = supportPath "themes.css";
              dest = "NixcordThemes.css";
            }
          ];

      themeSpecs = lib.lists.concatMap (
        name:
        lib.lists.optionals cfg.${name}.enable (
          lib.attrsets.mapAttrsToList (
            themeName: path:
            copy {
              name = "${name}-theme-${themeName}";
              enable = true;
              src = path;
              dest = "${cfg.${name}.configDir}/themes/${themeName}.css";
            }
          ) themes
        )
      ) desktopClients;

      oneOffSpecs = [
        (copy {
          name = "discord-quick-css";
          enable = quickCssOnDiscord;
          src = quickCss;
          dest = "${configDir}/settings/quickCss.css";
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
        (copy {
          name = "goofcord-settings";
          enable = goofcord.enable && goofcordSettings != null;
          src = goofcordSettings;
          dest = "${goofcord.configDir}/settings.json";
          writable = true;
        })
      ];

      discordSettingsSpecs =
        let
          branches = getDiscordBranches cfg;
          multipleBranches = builtins.length branches > 1;
        in
        map (
          branch:
          copy {
            name = if multipleBranches then "discord-${branch}-settings" else "discord-settings";
            enable = discord.enable && discord.settings != { };
            src = settings.discordSettingsFile;
            dest = "${getDiscordConfigDir cfg branch}/settings.json";
            writable = true;
          }
        ) branches;

      fileSpecs =
        oneOffSpecs
        ++ discordSettingsSpecs
        ++ discordModSettingsSpecs
        ++ desktopSettingsSpecs
        ++ legcordWebSpecs
        ++ goofcordAssetSpecs
        ++ themeSpecs;
    in
    lib.trivial.pipe fileSpecs [
      (lib.lists.filter (spec: spec.enable))
      (map (spec: lib.attrsets.removeAttrs spec [ "enable" ]))
    ];

  mkCopyCommands =
    # Keep this function on the already-filtered specs.  Reconstructing the
    # specs here creates a second copy of the same option-dependent traversal
    # during NixOS evaluation; Nix only memoizes values, not equivalent calls.
    fileSpecs:
    let
      mkCopy =
        spec:
        "copy_file ${lib.strings.escapeShellArg spec.src} ${lib.strings.escapeShellArg spec.dest} 0644";
    in
    lib.strings.concatMapStringsSep "\n" mkCopy fileSpecs;

  mkInstalledPackages =
    cfg: finalPackages:
    lib.lists.optionals (cfg.discord.enable && cfg.discord.installPackage) (
      map (branch: finalPackages.discordBranches.${branch}) (getDiscordBranches cfg)
    )
    ++
      lib.lists.concatMap
        (
          name:
          lib.lists.optional (
            cfg.${name}.enable && cfg.${name}.installPackage && finalPackages.${name} != null
          ) finalPackages.${name}
        )
        [
          "vesktop"
          "equibop"
          "goofcord"
          "dorion"
          "legcord"
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
      }
      //
        lib.attrsets.concatMapAttrs
          (name: fullConfig: {
            "${name}SettingsFile" = {
              enable = true;
              name = "${name}-settings";
              value = fullConfig;
            };
            "${name}ClientSettingsFile" = {
              enable = cfg.${name}.settings != { };
              name = "${name}-client-settings";
              value = cfg.${name}.settings;
            };
            "${name}StateFile" = {
              enable = cfg.${name}.state != { };
              name = "${name}-state";
              value = cfg.${name}.state;
            };
          })
          {
            vesktop = vesktopFullConfig;
            equibop = equibopFullConfig;
          };
    in
    lib.attrsets.mapAttrs (
      _: spec:
      if spec.enable then
        jsonFormat.generate "nixcord-${spec.name}.json" (mkVencordCfg spec.value)
      else
        null
    ) settingSpecs;

  mkThemeFile =
    { pkgs }:
    name: value:
    if builtins.isPath value || lib.strings.isStorePath value then
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
