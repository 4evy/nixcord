{
  config,
  lib,
  pkgs,
  ...
}:
{
  _class = "darwin";

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

      inherit (import ../lib/discord.nix { inherit lib; }) getDiscordConfigDirs;

      homeDir = lib.trivial.defaultTo "/Users/${cfg.user}" (
        lib.attrsets.attrByPath [ cfg.user "home" ] null config.users.users
      );
      basePath = "${homeDir}/Library/Application Support";

      managedConfigDirs = [
        cfg.configDir
      ]
      ++ lib.lists.optionals cfg.discord.enable (getDiscordConfigDirs cfg)
      ++ lib.lists.optional cfg.vesktop.enable cfg.vesktop.configDir
      ++ lib.lists.optional cfg.equibop.enable cfg.equibop.configDir
      ++ lib.lists.optional cfg.goofcord.enable cfg.goofcord.configDir
      ++ lib.lists.optional cfg.dorion.enable cfg.dorion.configDir
      ++ lib.lists.optional cfg.legcord.enable cfg.legcord.configDir;

      activationScripts = common.mkActivationScripts (script: ''
        sudo --user=${lib.strings.escapeShellArg cfg.user} -- ${pkgs.runtimeShell} -c ${lib.strings.escapeShellArg script}
      '');

      install = lib.meta.getExe' pkgs.coreutils "install";

    in
    lib.modules.mkMerge [
      {
        programs.nixcord = (mkConfigDirs cfg basePath) // {
          homeDirectory = lib.modules.mkDefault homeDir;
          xdgConfigHome = lib.modules.mkDefault "${homeDir}/.config";
          # Darwin dorion uses ~/.config instead of ~/Library/Application Support
          dorion.configDir = lib.modules.mkDefault "${homeDir}/.config/dorion";
        };
      }
      {
        programs.nixcord.finalPackage = packages.final;

        environment.systemPackages = packages.installed;
      }
      (lib.modules.mkIf cfg.discord.enable {
        # nix-darwin executes a fixed set of activation stages; custom
        # activation attribute names are not included in the final script.
        system.activationScripts.applications.text = lib.modules.mkAfter ''
          ${activationScripts.disableDiscordUpdates}
          ${activationScripts.fixDiscordModules}
        '';
      })
      (lib.modules.mkIf (fileSpecs != [ ]) {
        system.activationScripts.applications.text = lib.modules.mkAfter (
          let
            mkDir =
              dir:
              "${install} -d -o ${lib.strings.escapeShellArg cfg.user} -g staff ${lib.strings.escapeShellArg dir}";
          in
          ''
            ${lib.strings.concatMapStringsSep "\n" mkDir managedConfigDirs}

            copy_file() {
              sudo --user=${lib.strings.escapeShellArg cfg.user} -- ${install} -D -m "$3" "$1" "$2"
            }

            ${fileCopyCommands}
          ''
        );
      })
      (lib.modules.mkIf cfg.dorion.enable {
        system.activationScripts.applications.text = lib.modules.mkAfter activationScripts.setupDorionVencordSettings;
      })
    ]
  );
}
