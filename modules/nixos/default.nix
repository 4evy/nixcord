{
  config,
  lib,
  pkgs,
  ...
}:
{
  _class = "nixos";

  imports = [
    ../options
    ../plugins/migrations.nix
    ../warnings.nix
  ];

  config = lib.modules.mkIf config.programs.nixcord.enable (
    let
      common = import ../lib/mkCommonConfig.nix {
        inherit
          config
          lib
          pkgs
          ;
      };

      inherit (common)
        cfg
        packages
        mkConfigDirs
        fileSpecs
        fileCopyCommands
        ;

      homeDir = lib.attrsets.attrByPath [ cfg.user "home" ] "/home/${cfg.user}" config.users.users;

      activationScripts = common.mkActivationScripts (script: ''
        # NixOS puts util-linux in the activation script PATH.  Keeping
        # runuser unqualified avoids forcing that large package solely while
        # evaluating this module; the system activation script already owns
        # and guarantees the dependency.
        runuser -u ${lib.strings.escapeShellArg cfg.user} -- ${pkgs.runtimeShell} -c ${lib.strings.escapeShellArg script}
      '');

      writeFilesScript =
        let
          install = lib.meta.getExe' pkgs.coreutils "install";
          idBin = lib.meta.getExe' pkgs.coreutils "id";
        in
        ''
          set -euo pipefail

          target_user=${lib.strings.escapeShellArg cfg.user}
          target_group="$(${idBin} -gn "$target_user")"

          copy_file() {
            local src="$1"
            local dest="$2"
            local mode="$3"
            ${install} -D -m "$mode" -o "$target_user" -g "$target_group" "$src" "$dest"
          }

          ${fileCopyCommands}
        '';
    in
    lib.modules.mkMerge [
      {
        programs.nixcord = {
          homeDirectory = lib.modules.mkDefault homeDir;
          xdgConfigHome = lib.modules.mkDefault "${cfg.homeDirectory}/.config";
          finalPackage = packages.final;
        }
        // mkConfigDirs cfg cfg.xdgConfigHome;

        environment.systemPackages = packages.installed;
      }
      (lib.modules.mkIf cfg.discord.enable {
        system.activationScripts.nixcord-disableDiscordUpdates = {
          deps = [ "users" ];
          text = activationScripts.disableDiscordUpdates;
          supportsDryActivation = false;
        };
        system.activationScripts.nixcord-fixDiscordModules = {
          deps = [ "users" ];
          text = activationScripts.fixDiscordModules;
          supportsDryActivation = false;
        };
      })
      (lib.modules.mkIf cfg.dorion.enable {
        system.activationScripts.nixcord-setupDorionVencordSettings = {
          deps = [ "users" ];
          text = activationScripts.setupDorionVencordSettings;
          supportsDryActivation = false;
        };
      })
      (lib.modules.mkIf (fileSpecs != [ ]) {
        system.activationScripts.nixcord-writeFiles = {
          deps = [ "users" ];
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
    ]
  );
}
