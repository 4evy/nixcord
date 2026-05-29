{
  config,
  lib,
  pkgs,
  ...
}:
let
  inherit (lib) mkIf mkMerge;

  inherit (import ../lib/shared.nix { inherit lib; })
    mkCopyCommands
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
        vencord
        equicord
        isQuickCssUsed
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

      activationScripts = import ../lib/activation.nix {
        inherit
          lib
          pkgs
          cfg
          mkVencordCfg
          ;
        wrapScript = script: ''
          ${lib.getExe' pkgs.util-linux "runuser"} -u ${lib.escapeShellArg cfg.user} -- /bin/sh -c ${lib.escapeShellArg script}
        '';
      };

      writeFilesScript =
        let
          install = lib.getExe' pkgs.coreutils "install";
          idBin = lib.getExe' pkgs.coreutils "id";

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
        ''
          set -euo pipefail

          target_user=${lib.escapeShellArg cfg.user}
          target_group_default=${lib.escapeShellArg null}
          target_group="$target_group_default"
          if [ -z "$target_group" ]; then
            target_group="$(${idBin} -gn "$target_user")"
          fi

          copy_file() {
            local src="$1"
            local dest="$2"
            local mode="$3"
            ${install} -D -m "$mode" -o "$target_user" -g "$target_group" "$src" "$dest"
          }

          ${fileCommands}
        '';
    in
    mkMerge ([
      {
        programs.nixcord = {
          homeDirectory = "/home/${cfg.user}";
          xdgConfigHome = "${"/home/${cfg.user}"}/.config";
          finalPackage = mkFinalPackages {
            inherit cfg;
            inherit vencord equicord;
          };
        }
        // mkConfigDirs {
          inherit cfg;
          basePath = cfg.xdgConfigHome;
        };

        environment.systemPackages = mkMerge [
          (mkIf (cfg.discord.enable && cfg.discord.installPackage) [ cfg.finalPackage.discord ])
          (mkIf (cfg.vesktop.enable && cfg.vesktop.installPackage) [ cfg.finalPackage.vesktop ])
          (mkIf (cfg.equibop.enable && cfg.finalPackage.equibop != null && cfg.equibop.installPackage) [
            cfg.finalPackage.equibop
          ])
          (mkIf (cfg.dorion.enable && cfg.dorion.installPackage) [ cfg.finalPackage.dorion ])
          (mkIf (cfg.legcord.enable && cfg.legcord.installPackage) [ cfg.finalPackage.legcord ])
        ];
      }
      (mkIf cfg.discord.enable {
        system.activationScripts.nixcord-disableDiscordUpdates = {
          text = activationScripts.disableDiscordUpdates;
          supportsDryActivation = false;
        };
        system.activationScripts.nixcord-fixDiscordModules = {
          text = activationScripts.fixDiscordModules;
          supportsDryActivation = false;
        };
      })
      (mkIf cfg.dorion.enable {
        system.activationScripts.nixcord-setupDorionVencordSettings = {
          text = activationScripts.setupDorionVencordSettings;
          supportsDryActivation = false;
        };
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
          system.activationScripts.nixcord-writeFiles = {
            text = writeFilesScript;
            supportsDryActivation = false;
          };
        }
      )
    ])
  );
}
