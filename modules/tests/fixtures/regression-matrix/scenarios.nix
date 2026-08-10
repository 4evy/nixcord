{
  lib,
  pluginRoot ? ../../../plugins,
}:

let

  mergeMany = lib.lists.foldl' lib.attrsets.recursiveUpdate { };

  sharedPluginNames = builtins.attrNames (
    lib.trivial.importJSON (lib.path.append pluginRoot "shared.json")
  );
  vencordPluginNames = builtins.attrNames (
    lib.trivial.importJSON (lib.path.append pluginRoot "vencord.json")
  );
  equicordPluginNames = builtins.attrNames (
    lib.trivial.importJSON (lib.path.append pluginRoot "equicord.json")
  );

  mkPluginSet =
    pluginNames:
    lib.attrsets.genAttrs pluginNames (_: {
      enable = true;
    });

  mkPluginNames =
    expected:
    let
      hasVencordClient =
        expected.discordMod == "vencord"
        || expected.vesktop
        || expected.goofcordMod == "vencord"
        || builtins.elem "vencord" expected.legcordBundles;
      hasEquicordClient =
        expected.discordMod == "equicord"
        || expected.equibop
        || expected.goofcordMod == "equicord"
        || builtins.elem "equicord" expected.legcordBundles;
    in
    lib.lists.unique (
      sharedPluginNames
      ++ lib.lists.optionals hasVencordClient vencordPluginNames
      ++ lib.lists.optionals hasEquicordClient equicordPluginNames
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

    goofcord = {
      installPackage = false;
      autoscroll.enable = true;
      settings = {
        minimizeToTray = true;
        hardwareAcceleration = true;
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
    goofcordConfig.useQuickCss = true;
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
    lib.attrsets.mapCartesianProduct
      (
        {
          vesktop,
          equibop,
          dorion,
        }:
        let
          enabled =
            lib.lists.optional vesktop "vesktop"
            ++ lib.lists.optional equibop "equibop"
            ++ lib.lists.optional dorion "dorion";
        in
        {
          name = "clients-${if enabled == [ ] then "none" else lib.strings.concatStringsSep "-" enabled}";
          config = {
            vesktop.enable = vesktop;
            equibop.enable = equibop;
            dorion.enable = dorion;
          };
          expected = { inherit vesktop equibop dorion; };
        }
      )
      {
        vesktop = bools;
        equibop = bools;
        dorion = bools;
      };

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
          bundleName = if bundles == [ ] then "none" else lib.strings.concatStringsSep "-" bundles;
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

  goofcordModes = [
    {
      name = "goofcord-off";
      config.goofcord.enable = false;
      expected = {
        goofcord = false;
        goofcordMod = null;
      };
    }
    {
      name = "goofcord-vencord";
      config.goofcord = {
        enable = true;
        clientMod = "vencord";
      };
      expected = {
        goofcord = true;
        goofcordMod = "vencord";
      };
    }
    {
      name = "goofcord-equicord";
      config.goofcord = {
        enable = true;
        clientMod = "equicord";
      };
      expected = {
        goofcord = true;
        goofcordMod = "equicord";
      };
    }
  ];

  mkScenario =
    discord: desktop: legcord: goofcord:
    let
      name = "${discord.name}__${desktop.name}__${legcord.name}__${goofcord.name}";
      expected = mergeMany [
        discord.expected
        desktop.expected
        legcord.expected
        goofcord.expected
      ];
      pluginNames = mkPluginNames expected;
      config = mergeMany [
        baseConfig
        discord.config
        desktop.config
        legcord.config
        goofcord.config
        { config.plugins = mkPluginSet pluginNames; }
      ];
    in
    lib.attrsets.nameValuePair name {
      module = {
        programs.nixcord = config;
      };
      expected = expected // {
        inherit pluginNames;
      };
    };

  # Cover every Discord/desktop pair and rotate Legcord modes so every other
  # pair of independent client axes is covered without a full Cartesian product.
  pairwiseScenarios = lib.lists.concatLists (
    lib.lists.imap0 (
      discordIndex: discord:
      lib.lists.imap0 (
        desktopIndex: desktop:
        mkScenario discord desktop (builtins.elemAt legcordModes (
          lib.trivial.mod (discordIndex + desktopIndex) (builtins.length legcordModes)
        )) (builtins.head goofcordModes)
      ) desktopCombos
    ) discordModes
  );

  goofcordOnlyScenarios = map (
    goofcord:
    mkScenario (builtins.head discordModes) (builtins.head desktopCombos) (builtins.head legcordModes)
      goofcord
  ) (builtins.tail goofcordModes);

  scenarios = builtins.listToAttrs (pairwiseScenarios ++ goofcordOnlyScenarios);
in
{
  inherit scenarios;
}
