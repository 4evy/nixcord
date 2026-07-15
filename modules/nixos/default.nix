{
  config,
  lib,
  pkgs,
  ...
}:
let
  inherit (lib) mkIf mkMerge;
in
{
  imports = [
    ../options
    ../plugins/migrations.nix
    ../warnings.nix
  ];

  config = mkIf config.programs.nixcord.enable (
    let
      common = import ../lib/mkCommonConfig.nix { inherit config lib pkgs; };

      inherit (common)
        cfg
        packages
        mkConfigDirs
        fileSpecs
        fileCopyCommands
        ;

      activationScripts = common.mkActivationScripts (script: ''
        ${lib.getExe' pkgs.util-linux "runuser"} -u ${lib.escapeShellArg cfg.user} -- /bin/sh -c ${lib.escapeShellArg script}
      '');

      writeFilesScript =
        let
          install = lib.getExe' pkgs.coreutils "install";
          idBin = lib.getExe' pkgs.coreutils "id";
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

          ${fileCopyCommands}
        '';
    in
    mkMerge ([
      {
        programs.nixcord = {
          homeDirectory = "/home/${cfg.user}";
          xdgConfigHome = "${"/home/${cfg.user}"}/.config";
          finalPackage = packages.final;
        }
        // mkConfigDirs cfg cfg.xdgConfigHome;

        environment.systemPackages = packages.installed;
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
      (mkIf (fileSpecs != [ ]) {
        system.activationScripts.nixcord-writeFiles = {
          # NixOS concatenates activation snippets in one shell, so keep this
          # snippet's strict shell options from affecting later snippets.
          text = ''
            (
              ${writeFilesScript}
            )
          '';
          supportsDryActivation = false;
        };
      })
    ])
  );
}
