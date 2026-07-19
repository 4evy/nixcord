{ testLib }:

let
  common = import ./common.nix { inherit testLib; };
  inherit (common)
    baseConfig
    vesktopBaseConfig
    recursiveUpdate
    ;
  inherit (testLib) lib pkgs;
  stubDiscordPackage = pkgs.runCommand "nixcord-discord-stub" { } "mkdir $out" // {
    passthru.nixcordCommandLineArgsList = true;
    override =
      lib.setFunctionArgs
        (
          args:
          pkgs.runCommand "nixcord-discord-final-stub" { } "mkdir $out"
          // {
            passthru.nixcordOverrideArgs = args;
          }
        )
        {
          branch = true;
          commandLineArgs = true;
          equicord = true;
          vencord = true;
          withEquicord = true;
          withKrisp = true;
          withOpenASAR = true;
          withVencord = true;
        };
  };
  stubDiscordPackageWithoutKrisp =
    pkgs.runCommand "nixcord-discord-no-krisp-stub" { } "mkdir $out"
    // {
      passthru.nixcordCommandLineArgsList = true;
      override =
        lib.setFunctionArgs
          (
            args:
            assert !(args ? withKrisp);
            pkgs.runCommand "nixcord-discord-no-krisp-final-stub" { } "mkdir $out"
            // {
              passthru.nixcordOverrideArgs = args;
            }
          )
          {
            branch = true;
            commandLineArgs = true;
            equicord = true;
            vencord = true;
            withEquicord = true;
            withOpenASAR = true;
            withVencord = true;
          };
    };
  stubDiscordPackageWithStringArgs =
    pkgs.runCommand "nixcord-discord-string-args-stub" { } "mkdir $out"
    // {
      override =
        lib.setFunctionArgs
          (
            args:
            pkgs.runCommand "nixcord-discord-string-args-final-stub" { } "mkdir $out"
            // {
              passthru.nixcordOverrideArgs = args;
            }
          )
          {
            branch = true;
            commandLineArgs = true;
            equicord = true;
            vencord = true;
            withEquicord = true;
            withOpenASAR = true;
            withVencord = true;
          };
    };
  stubVesktopPackage = pkgs.runCommand "nixcord-vesktop-stub" { } "mkdir $out" // {
    override =
      args:
      pkgs.runCommand "nixcord-vesktop-final-stub" { } "mkdir $out"
      // {
        passthru.nixcordOverrideArgs = args;
      };
  };
  stubEquicordPackage = pkgs.runCommand "nixcord-equicord-stub" { } "mkdir -p $out/equibop" // {
    overrideAttrs =
      f:
      let
        attrs = f {
          postPatch = "";
          postInstall = "";
        };
      in
      pkgs.runCommand "nixcord-equicord-final-stub" { } "mkdir -p $out/equibop" // attrs;
  };
  stubEquibopPackage = lib.makeOverridable (
    {
      withMiddleClickScroll ? false,
    }:
    pkgs.runCommand "nixcord-equibop-stub" {
      passthru.nixcordWithMiddleClickScroll = withMiddleClickScroll;
    } "mkdir $out"
    // {
      postPatch = "";
      postFixup = "";
    }
  ) { };
in
{
  "vencord is disabled by default" =
    let
      config = testLib.eval.hm {
        enable = true;
        discord.package = stubDiscordPackage;
      };
      overrideArgs = config.programs.nixcord.finalPackage.discord.passthru.nixcordOverrideArgs;
    in
    assert !config.programs.nixcord.discord.vencord.enable;
    assert !config.programs.nixcord.discord.equicord.enable;
    assert !overrideArgs.withVencord;
    assert !overrideArgs.withEquicord;
    true;

  "equicord enables without explicit vencord disable" =
    let
      config = testLib.eval.hm {
        enable = true;
        discord.package = stubDiscordPackage;
        discord.equicord.enable = true;
      };
      overrideArgs = config.programs.nixcord.finalPackage.discord.passthru.nixcordOverrideArgs;
    in
    assert !config.programs.nixcord.discord.vencord.enable;
    assert !overrideArgs.withVencord;
    assert overrideArgs.withEquicord == true;
    assert lib.hasSuffix "Equicord" (toString config.programs.nixcord.configDir);
    true;

  "configDir defaults to Vencord when vencord is enabled" =
    let
      config = testLib.eval.hm {
        enable = true;
        discord.vencord.enable = true;
      };
    in
    assert lib.hasSuffix "Vencord" (toString config.programs.nixcord.configDir);
    true;

  "discord settings are generated when non-empty" =
    let
      config = testLib.eval.hm (
        recursiveUpdate baseConfig {
          discord.settings = {
            BACKGROUND_COLOR = "#2c2d32";
            USE_NEW_UPDATER = true;
          };
        }
      );
      settingsJson = testLib.output.homeFileJSON config "/home/testuser/.config/discord/settings.json";
    in
    assert !(builtins.hasAttr "/home/testuser/.config/discord/settings.json" config.home.file);
    assert config.home.activation ? nixcord-discord-settings;
    assert settingsJson.BACKGROUND_COLOR == "#2c2d32";
    assert settingsJson.SKIP_HOST_UPDATE == true;
    assert settingsJson.SKIP_MODULE_UPDATE == true;
    assert settingsJson.USE_NEW_UPDATER == false;
    true;

  "discord autoscroll shim appends commandLineArgs" =
    let
      config = testLib.eval.hm (
        recursiveUpdate baseConfig {
          discord = {
            package = stubDiscordPackage;
            autoscroll.enable = true;
            commandLineArgs = [ "--ozone-platform-hint=auto" ];
          };
        }
      );
      overrideArgs = config.programs.nixcord.finalPackage.discord.passthru.nixcordOverrideArgs;
    in
    assert
      overrideArgs.commandLineArgs == [
        "--ozone-platform-hint=auto"
        "--enable-blink-features=MiddleClickAutoscroll"
      ];
    true;

  "Discord packages without list support receive shell-escaped commandLineArgs" =
    let
      commandLineArgs = [
        "--simple"
        "--flag=value with spaces"
        "--quote=\"value\""
      ];
      config = testLib.eval.hm (
        recursiveUpdate baseConfig {
          discord = {
            package = stubDiscordPackageWithStringArgs;
            inherit commandLineArgs;
          };
        }
      );
      overrideArgs = config.programs.nixcord.finalPackage.discord.passthru.nixcordOverrideArgs;
    in
    assert overrideArgs.commandLineArgs == lib.escapeShellArgs commandLineArgs;
    true;

  "discord custom package does not receive disabled krisp override" =
    let
      config = testLib.eval.hm (
        recursiveUpdate baseConfig {
          discord = {
            package = stubDiscordPackageWithoutKrisp;
            vencord.enable = false;
            equicord.enable = true;
          };
        }
      );
      overrideArgs = config.programs.nixcord.finalPackage.discord.passthru.nixcordOverrideArgs;
    in
    assert !(overrideArgs ? withKrisp);
    assert overrideArgs.withEquicord == true;
    true;

  "discord krisp option passes krisp override when enabled" =
    let
      config = testLib.eval.hm (
        recursiveUpdate baseConfig {
          discord = {
            package = stubDiscordPackage;
            krisp.enable = true;
          };
        }
      );
      overrideArgs = config.programs.nixcord.finalPackage.discord.passthru.nixcordOverrideArgs;
    in
    assert overrideArgs.withKrisp == true;
    true;

  "vesktop settings are generated when vesktop is enabled" =
    let
      config = testLib.eval.hm (
        recursiveUpdate vesktopBaseConfig {
          config.plugins.alwaysAnimate.enable = true;
        }
      );
      settingsJson = testLib.output.homeFileJSON config "/home/testuser/.config/vesktop/settings/settings.json";
    in
    assert settingsJson.plugins.AlwaysAnimate.enabled == true;
    true;

  "vesktop package options reach its override" =
    let
      config = testLib.eval.hm {
        enable = true;
        discord.enable = false;
        vesktop = {
          enable = true;
          package = stubVesktopPackage;
          useSystemVencord = false;
          autoscroll.enable = true;
        };
      };
      overrideArgs = config.programs.nixcord.finalPackage.vesktop.passthru.nixcordOverrideArgs;
    in
    assert overrideArgs.withSystemVencord == false;
    assert overrideArgs.withMiddleClickScroll == true;
    assert overrideArgs.vencord != null;
    true;

  "equibop uses patched system Equicord by default" =
    let
      config = testLib.eval.hm {
        enable = true;
        discord.enable = false;
        discord.equicord.package = stubEquicordPackage;
        equibop = {
          enable = true;
          package = stubEquibopPackage;
        };
      };
      inherit (config.programs.nixcord.finalPackage) equibop;
      inherit (config._nixcordTest.common.packages) equicord;
      postPatch = builtins.unsafeDiscardStringContext equibop.postPatch;
      equicordAsar = builtins.unsafeDiscardStringContext "${equicord}/equibop.asar";
    in
    assert lib.hasInfix "src/main/vencordDir.ts src/main/constants.ts" postPatch;
    assert lib.hasInfix "could not find Equibop Equicord asar path to patch" postPatch;
    assert lib.hasInfix equicordAsar postPatch;
    true;

  "equibop can keep bundled Equicord" =
    let
      config = testLib.eval.hm {
        enable = true;
        discord.enable = false;
        equibop = {
          enable = true;
          package = stubEquibopPackage;
          useSystemEquicord = false;
        };
      };
      inherit (config.programs.nixcord.finalPackage) equibop;
      postPatch = builtins.unsafeDiscardStringContext equibop.postPatch;
    in
    assert !(lib.hasInfix "equicordPatchTarget" postPatch);
    true;

  "equibop autoscroll reaches its package override" =
    let
      config = testLib.eval.hm {
        enable = true;
        discord.enable = false;
        equibop = {
          enable = true;
          package = stubEquibopPackage;
          useSystemEquicord = false;
          autoscroll.enable = true;
        };
      };
    in
    assert config.programs.nixcord.finalPackage.equibop.passthru.nixcordWithMiddleClickScroll;
    true;

  "dorion defaults to nixpkgs package" =
    let
      config = testLib.eval.hm {
        enable = true;
        discord.enable = false;
        dorion.enable = true;
      };
    in
    assert toString config.programs.nixcord.dorion.package == toString pkgs.dorion;
    true;
}
