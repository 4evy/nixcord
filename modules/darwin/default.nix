{
  config,
  lib,
  pkgs,
  ...
}:
let
  inherit (lib)
    mkIf
    mkMerge
    ;

  inherit (import ../lib/shared.nix { inherit lib; })
    mkCopyCommands
    mkInstalledPackages
    ;
in
{
  imports = [
    ../options
    ../plugins/migrations.nix
    ../warnings.nix
  ];

  config = mkIf config.programs.nixcord.enable (
    let
      inherit (import ../lib/mkCommonConfig.nix { inherit config lib pkgs; })
        cfg
        mkVencordCfg
        mkFinalPackages
        vencordFullConfig
        equicordFullConfig
        vesktopFullConfig
        equibopFullConfig
        vencord
        equicord
        isQuickCssUsed
        mkDorionConfigAttrs
        mkConfigDirs
        settingsFiles
        vesktopThemes
        dorionConfigFile
        legcordSettingsFile
        legcordVencordWeb
        legcordEquicordWeb
        quickCssFile
        ;

      inherit (settingsFiles)
        vencordSettingsFile
        equicordSettingsFile
        discordSettingsFile
        vesktopSettingsFile
        vesktopClientSettingsFile
        vesktopStateFile
        equibopSettingsFile
        equibopClientSettingsFile
        equibopStateFile
        ;

      homeDir = "/Users/${cfg.user}";
      basePath = "${homeDir}/Library/Application Support";

      activationScripts = import ../lib/activation.nix {
        inherit
          lib
          pkgs
          cfg
          mkVencordCfg
          ;
        wrapScript = script: ''
          ${script}
        '';
      };

      install = lib.getExe' pkgs.coreutils "install";

      fileCommands = mkCopyCommands {
        inherit
          lib
          cfg
          quickCssFile
          vencordSettingsFile
          equicordSettingsFile
          discordSettingsFile
          vesktopSettingsFile
          vesktopClientSettingsFile
          vesktopStateFile
          vesktopThemes
          equibopSettingsFile
          equibopClientSettingsFile
          equibopStateFile
          dorionConfigFile
          legcordSettingsFile
          legcordVencordWeb
          legcordEquicordWeb
          isQuickCssUsed
          ;
      };

    in
    mkMerge ([
      {
        programs.nixcord =
          (mkConfigDirs {
            inherit cfg;
            inherit basePath;
          })
          // {
            # Darwin dorion uses ~/.config instead of ~/Library/Application Support
            dorion.configDir = lib.mkDefault "${homeDir}/.config/dorion";
          };
      }
      {
        programs.nixcord.finalPackage = mkFinalPackages {
          inherit cfg;
          inherit vencord equicord;
        };

        environment.systemPackages = mkInstalledPackages cfg;
      }
      (mkIf cfg.discord.enable {
        system.activationScripts.nixcord-disableDiscordUpdates.text =
          activationScripts.disableDiscordUpdates;
        system.activationScripts.nixcord-fixDiscordModules.text = activationScripts.fixDiscordModules;
      })
      (mkIf
        (
          cfg.discord.enable
          || cfg.vesktop.enable
          || cfg.equibop.enable
          || cfg.dorion.enable
          || cfg.legcord.enable
        )
        {
          system.activationScripts.applications.text = lib.mkAfter (
            let
              mkDir = dir: "${install} -d -o ${lib.escapeShellArg cfg.user} -g staff ${lib.escapeShellArg dir}";
            in
            ''
              ${mkDir cfg.configDir}
              ${lib.optionalString cfg.discord.enable (mkDir cfg.discord.configDir)}
              ${lib.optionalString cfg.vesktop.enable (mkDir cfg.vesktop.configDir)}
              ${lib.optionalString cfg.equibop.enable (mkDir cfg.equibop.configDir)}
              ${lib.optionalString cfg.dorion.enable (mkDir cfg.dorion.configDir)}
              ${lib.optionalString cfg.legcord.enable (mkDir cfg.legcord.configDir)}

              copy_file() {
                sudo --user=${lib.escapeShellArg cfg.user} -- ${install} -D -m "$3" "$1" "$2"
              }

              ${fileCommands}
            ''
          );
        }
      )
      (mkIf cfg.dorion.enable {
        system.activationScripts.nixcord-setupDorionVencordSettings.text =
          activationScripts.setupDorionVencordSettings;
      })
    ])
  );
}
