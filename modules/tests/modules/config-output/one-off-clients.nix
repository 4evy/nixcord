{ testLib }:

let
  inherit (testLib) lib;
in
{
  "dorion config uses snake case and lets extraSettings override generated values" =
    let
      config = testLib.eval.hm {
        enable = true;
        discord.enable = false;
        dorion = {
          enable = true;
          startMaximized = true;
          disableHardwareAccel = true;
          extraSettings = {
            autoupdate = true;
            start_maximized = false;
            regression_setting = "kept";
          };
        };
      };
      cfg = config.programs.nixcord;
      dorionJson = testLib.output.homeFileJSON config "${cfg.dorion.configDir}/config.json";
    in
    assert dorionJson.autoupdate == true;
    assert dorionJson.start_maximized == false;
    assert dorionJson.disable_hardware_accel == true;
    assert dorionJson.regression_setting == "kept";
    assert !(dorionJson ? extra_settings);
    true;

  "legcord settings add enabled bundles without discarding user values" =
    let
      config = testLib.eval.hm {
        enable = true;
        discord.enable = false;
        legcord = {
          enable = true;
          vencord.enable = true;
          settings = {
            mods = [ "shelter" ];
            noBundleUpdates = [ "shelter" ];
            channel = "canary";
          };
        };
      };
      settingsJson = testLib.output.homeActivationInstallJSON config "nixcord-legcord-settings";
    in
    assert
      settingsJson.mods == [
        "shelter"
        "vencord"
      ];
    assert
      settingsJson.noBundleUpdates == [
        "shelter"
        "vencord"
      ];
    assert settingsJson.channel == "canary";
    assert settingsJson.doneSetup == true;
    true;

  "installPackage controls the Home Manager package list" =
    let
      config = testLib.eval.hm {
        enable = true;
        discord.installPackage = false;
        vesktop = {
          enable = true;
          installPackage = true;
        };
        dorion = {
          enable = true;
          installPackage = false;
        };
        legcord = {
          enable = true;
          installPackage = false;
        };
      };
      packages = map toString config.home.packages;
    in
    assert packages == [ (toString config.programs.nixcord.finalPackage.vesktop) ];
    true;

  "development branch selects its config directory and reaches the Discord override" =
    let
      stubDiscordPackage = testLib.pkgs.runCommand "nixcord-discord-branch-stub" { } "mkdir $out" // {
        passthru.nixcordCommandLineArgsList = true;
        override =
          args:
          testLib.pkgs.runCommand "nixcord-discord-branch-final-stub" { } "mkdir $out"
          // {
            passthru.nixcordOverrideArgs = args;
          };
      };
      config = testLib.eval.hm {
        enable = true;
        discord = {
          package = stubDiscordPackage;
          branch = "development";
          vencord.enable = true;
        };
      };
      cfg = config.programs.nixcord;
      overrideArgs = cfg.finalPackage.discord.passthru.nixcordOverrideArgs;
    in
    assert lib.hasSuffix "/discorddevelopment" (toString cfg.discord.configDir);
    assert overrideArgs.branch == "development";
    assert overrideArgs.withOpenASAR == true;
    assert overrideArgs.withVencord == true;
    assert overrideArgs.vencord != null;
    assert overrideArgs.withEquicord == false;
    assert overrideArgs.equicord == null;
    true;
}
