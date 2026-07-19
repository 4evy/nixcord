{
  lib,
  pluginRoot ? ../../../plugins,
}:

let
  inherit (lib)
    concatMap
    concatStringsSep
    filter
    foldl'
    nameValuePair
    optionalString
    optionals
    unique
    ;

  mergeMany = foldl' lib.recursiveUpdate { };

  sharedPluginNames = builtins.attrNames (lib.importJSON (pluginRoot + "/shared.json"));
  vencordPluginNames = builtins.attrNames (lib.importJSON (pluginRoot + "/vencord.json"));
  equicordPluginNames = builtins.attrNames (lib.importJSON (pluginRoot + "/equicord.json"));

  mkPluginSet =
    pluginNames:
    lib.genAttrs pluginNames (_: {
      enable = true;
    });

  mkPluginNames =
    expected:
    let
      hasVencordClient =
        expected.discordMod == "vencord"
        || expected.vesktop
        || builtins.elem "vencord" expected.legcordBundles;
      hasEquicordClient =
        expected.discordMod == "equicord"
        || expected.equibop
        || builtins.elem "equicord" expected.legcordBundles;
    in
    unique (
      sharedPluginNames
      ++ optionals hasVencordClient vencordPluginNames
      ++ optionals hasEquicordClient equicordPluginNames
    );

  baseConfig = {
    enable = true;
    quickCss = ''
      :root {
        --nixcord-regression: #5865f2;
      }
    '';

    discord = {
      installPackage = false;
      branch = "canary";
      commandLineArgs = [ "--ozone-platform-hint=auto" ];
      autoscroll.enable = true;
      openASAR.enable = true;
      settings = {
        IS_MAXIMIZED = false;
        SKIP_HOST_UPDATE = true;
      };
    };

    vesktop = {
      installPackage = false;
      autoscroll.enable = true;
      useSystemVencord = true;
      settings = {
        minimizeToTray = false;
        hardwareAcceleration = true;
      };
      state = {
        firstLaunch = false;
      };
    };

    equibop = {
      installPackage = false;
      autoscroll.enable = true;
      useSystemEquicord = true;
      settings = {
        minimizeToTray = true;
      };
      state = {
        firstLaunch = false;
      };
    };

    dorion = {
      installPackage = false;
      theme = "regression";
      themes = [
        "none"
        "regression"
      ];
      zoom = "1.10";
      blur = "blur";
      blurCss = true;
      sysTray = true;
      trayIconEnabled = true;
      useNativeTitlebar = true;
      startMaximized = true;
      disableHardwareAccel = true;
      openOnStartup = true;
      startupMinimized = true;
      multiInstance = true;
      pushToTalk = true;
      pushToTalkKeys = [
        "RControl"
        "F1"
      ];
      desktopNotifications = true;
      unreadBadge = true;
      win7StyleNotifications = true;
      cacheCss = true;
      autoClearCache = true;
      clientType = "web";
      clientMods = [
        "Shelter"
        "Vencord"
      ];
      clientPlugins = true;
      profile = "regression";
      streamerModeDetection = true;
      rpcServer = true;
      rpcProcessScanner = true;
      rpcIpcConnector = true;
      rpcWebsocketConnector = true;
      rpcSecondaryEvents = true;
      proxyUri = "socks5://127.0.0.1:1080";
      keybinds = {
        mute = [
          "Control"
          "M"
        ];
      };
      keybindsEnabled = true;
      updateNotify = false;
      extraSettings = {
        regression = true;
      };
    };

    legcord = {
      installPackage = false;
      settings = {
        channel = "stable";
        tray = "dynamic";
        minimizeToTray = true;
        hardwareAcceleration = true;
        windowStyle = "native";
      };
    };

    config = {
      useQuickCss = true;
      frameless = true;
      notifyAboutUpdates = false;
      autoUpdate = false;
      autoUpdateNotification = false;
      enableReactDevtools = true;
      transparent = true;
      disableMinSize = true;
      themeLinks = [ "https://example.invalid/regression.theme.css" ];
      enabledThemeLinks = [ "https://example.invalid/regression.theme.css" ];
      enabledThemes = [ "regression.css" ];
      themes.regression = ''
        .nixcord-regression {
          color: var(--nixcord-regression);
        }
      '';
      plugins = {
        hideMedia.enable = true;
        ignoreActivities = {
          enable = true;
          ignorePlaying = true;
          ignoredActivities = [
            {
              id = "regression-game";
              name = "Regression Game";
              type = 0;
            }
          ];
        };
      };
      uiElements = {
        chatBarButtons.GifPicker.enable = false;
        messagePopoverButtons.PinMessage.enable = false;
      };
    };

    vencordConfig.useQuickCss = true;
    equicordConfig.useQuickCss = true;
    vesktopConfig.useQuickCss = true;
    equibopConfig.useQuickCss = true;
  };

  discordModes = [
    {
      name = "discord-off";
      config.discord.enable = false;
      expected = {
        discord = false;
        discordMod = null;
      };
    }
    {
      name = "discord-bare";
      config.discord.enable = true;
      expected = {
        discord = true;
        discordMod = null;
      };
    }
    {
      name = "discord-vencord";
      config.discord = {
        enable = true;
        vencord.enable = true;
      };
      expected = {
        discord = true;
        discordMod = "vencord";
      };
    }
    {
      name = "discord-equicord";
      config.discord = {
        enable = true;
        equicord.enable = true;
      };
      expected = {
        discord = true;
        discordMod = "equicord";
      };
    }
  ];

  desktopCombos =
    let
      bools = [
        false
        true
      ];
    in
    concatMap (
      vesktop:
      concatMap (
        equibop:
        map (
          dorion:
          let
            enabled = filter (name: name != "") [
              (optionalString vesktop "vesktop")
              (optionalString equibop "equibop")
              (optionalString dorion "dorion")
            ];
          in
          {
            name = "clients-${if enabled == [ ] then "none" else concatStringsSep "-" enabled}";
            config = {
              vesktop.enable = vesktop;
              equibop.enable = equibop;
              dorion.enable = dorion;
            };
            expected = { inherit vesktop equibop dorion; };
          }
        ) bools
      ) bools
    ) bools;

  legcordModes = [
    {
      name = "legcord-off";
      config.legcord.enable = false;
      expected = {
        legcord = false;
        legcordBundles = [ ];
      };
    }
  ]
  ++
    map
      (
        bundles:
        let
          bundleName = if bundles == [ ] then "none" else concatStringsSep "-" bundles;
        in
        {
          name = "legcord-${bundleName}";
          config.legcord = {
            enable = true;
            vencord.enable = builtins.elem "vencord" bundles;
            equicord.enable = builtins.elem "equicord" bundles;
          };
          expected = {
            legcord = true;
            legcordBundles = bundles;
          };
        }
      )
      [
        [ ]
        [ "vencord" ]
        [ "equicord" ]
      ];

  mkScenario =
    discord: desktop: legcord:
    let
      name = "${discord.name}__${desktop.name}__${legcord.name}";
      expected = mergeMany [
        discord.expected
        desktop.expected
        legcord.expected
      ];
      pluginNames = mkPluginNames expected;
      config = mergeMany [
        baseConfig
        discord.config
        desktop.config
        legcord.config
        { config.plugins = mkPluginSet pluginNames; }
      ];
    in
    nameValuePair name {
      module = {
        programs.nixcord = config;
      };
      expected = expected // {
        inherit pluginNames;
      };
    };

  scenarios = builtins.listToAttrs (
    concatMap (
      discord:
      concatMap (desktop: map (legcord: mkScenario discord desktop legcord) legcordModes) desktopCombos
    ) discordModes
  );
in
{
  inherit scenarios;
}
