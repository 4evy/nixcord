{ testLib }:

let
  inherit (testLib) lib pkgs;

  stubDiscordPackage = lib.customisation.makeOverridable (
    {
      branch ? "stable",
      commandLineArgs ? [ ],
      equicord ? null,
      vencord ? null,
      withEquicord ? false,
      withKrisp ? false,
      withOpenASAR ? false,
      withVencord ? false,
      appDataDir ? null,
      modDataDir ? null,
    }:
    pkgs.runCommand "nixcord-discord-${branch}-final-stub" {
      passthru.nixcordOverrideArgs = {
        inherit
          branch
          commandLineArgs
          equicord
          vencord
          withEquicord
          withKrisp
          withOpenASAR
          withVencord
          appDataDir
          modDataDir
          ;
      };
      passthru.nixcordCommandLineArgsList = true;
    } "mkdir $out"
  ) { };

  branches = [
    "stable"
    "ptb"
    "canary"
  ];

  nixcordConfig = {
    enable = true;
    discord = {
      inherit branches;
      package = stubDiscordPackage;
      equicord.enable = true;
      krisp.enable = true;
      commandLineArgs = [ "--ozone-platform-hint=auto" ];
      settings.BACKGROUND_COLOR = "#2c2d32";
    };
  };

  config = testLib.eval.hm nixcordConfig;
  cfg = config.programs.nixcord;
  packages = cfg.finalPackage.discordBranches;
  configBase =
    if pkgs.stdenvNoCC.hostPlatform.isDarwin then
      "/home/testuser/Library/Application Support/nixcord"
    else
      "/home/testuser/.config";
  configDirs = {
    stable = "${configBase}/discord";
    ptb = "${configBase}/discordptb";
    canary = "${configBase}/discordcanary";
  };
in
{
  "multiple Discord branches receive all shared package options" =
    assert
      builtins.attrNames packages == [
        "canary"
        "ptb"
        "stable"
      ];
    assert cfg.finalPackage.discord == packages.stable;
    assert lib.lists.all (
      branch:
      let
        args = packages.${branch}.passthru.nixcordOverrideArgs;
      in
      args.branch == branch
      && args.withEquicord
      && !args.withVencord
      && args.equicord != null
      && args.vencord == null
      && args.withKrisp
      && args.withOpenASAR
      && args.appDataDir == (if pkgs.stdenvNoCC.hostPlatform.isDarwin then configBase else null)
      && args.modDataDir == (if pkgs.stdenvNoCC.hostPlatform.isDarwin then cfg.configDir else null)
      && args.commandLineArgs == [ "--ozone-platform-hint=auto" ]
    ) branches;
    true;

  "multiple Discord branches are installed in configured order" =
    assert map toString config.home.packages == map (branch: toString packages.${branch}) branches;
    true;

  "multiple Discord branches each receive managed host settings" =
    assert config.home.activation ? nixcord-discord-stable-settings;
    assert config.home.activation ? nixcord-discord-ptb-settings;
    assert config.home.activation ? nixcord-discord-canary-settings;
    lib.strings.concatMapStringsSep "\n" (
      branch:
      testLib.output.json (testLib.output.homeFileSource config "${configDirs.${branch}}/settings.json") ''
        .BACKGROUND_COLOR == "#2c2d32"
        and .SKIP_HOST_UPDATE == true
        and .SKIP_MODULE_UPDATE == true
        and .USE_NEW_UPDATER == false
      ''
    ) branches;

  "Darwin profile overrides reach every branch and migration precedes settings" =
    if !pkgs.stdenvNoCC.hostPlatform.isDarwin then
      true
    else
      let
        custom = testLib.eval.hm (
          nixcordConfig
          // {
            configDir = "/tmp/custom mod settings";
            discord = nixcordConfig.discord // {
              appDataDir = "/tmp/custom profiles";
            };
          }
        );
        customCfg = custom.programs.nixcord;
      in
      assert customCfg.discord.configDir == "/tmp/custom profiles/discord";
      assert lib.lists.all (
        branch:
        let
          args = customCfg.finalPackage.discordBranches.${branch}.passthru.nixcordOverrideArgs;
        in
        args.appDataDir == "/tmp/custom profiles" && args.modDataDir == "/tmp/custom mod settings"
      ) branches;
      assert lib.lists.all (
        branch:
        builtins.elem "disableDiscordUpdates"
          custom.home.activation."nixcord-discord-${branch}-settings".after
      ) branches;
      true;

  "duplicate Discord branches are normalized" =
    let
      duplicateConfig = testLib.eval.hm {
        enable = true;
        discord = {
          package = stubDiscordPackage;
          branches = [
            "canary"
            "canary"
            "ptb"
          ];
        };
      };
    in
    assert
      duplicateConfig.programs.nixcord.discord.branches == [
        "canary"
        "ptb"
      ];
    assert
      duplicateConfig.programs.nixcord.finalPackage.discord
      == duplicateConfig.programs.nixcord.finalPackage.discordBranches.canary;
    true;

  "legacy Discord branch option is a low-priority shim for branches" =
    let
      legacyConfig = testLib.eval.hm {
        enable = true;
        discord = {
          branch = "canary";
          package = stubDiscordPackage;
        };
      };
      canonicalWinsConfig = testLib.eval.hm {
        enable = true;
        discord = {
          branch = "canary";
          branches = [
            "ptb"
            "stable"
          ];
          package = stubDiscordPackage;
        };
      };
    in
    assert legacyConfig.programs.nixcord.discord.branches == [ "canary" ];
    assert
      builtins.attrNames legacyConfig.programs.nixcord.finalPackage.discordBranches == [ "canary" ];
    assert
      canonicalWinsConfig.programs.nixcord.discord.branches == [
        "ptb"
        "stable"
      ];
    assert
      canonicalWinsConfig.programs.nixcord.finalPackage.discord
      == canonicalWinsConfig.programs.nixcord.finalPackage.discordBranches.ptb;
    true;

  "multiple Discord branches are installed by NixOS and nix-darwin modules" =
    let
      nixos = testLib.eval.nixos nixcordConfig;
      darwin = testLib.eval.darwin nixcordConfig;
    in
    assert builtins.length nixos.environment.systemPackages == 3;
    assert builtins.length darwin.environment.systemPackages == 3;
    assert
      map (package: package.passthru.nixcordOverrideArgs.branch) nixos.environment.systemPackages
      == branches;
    assert
      map (package: package.passthru.nixcordOverrideArgs.branch) darwin.environment.systemPackages
      == branches;
    true;
}
