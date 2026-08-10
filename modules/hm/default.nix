{
  config,
  lib,
  pkgs,
  ...
}:
{
  _class = "homeManager";

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
        ;

      install = lib.meta.getExe' pkgs.coreutils "install";

      fileSpecsByWritable = lib.lists.partition (spec: spec.writable) fileSpecs;

      homeFiles = lib.attrsets.genAttrs' fileSpecsByWritable.wrong (
        spec:
        lib.attrsets.nameValuePair spec.dest {
          source = spec.src;
        }
      );
      writableHomeActivations = lib.attrsets.genAttrs' fileSpecsByWritable.right (
        spec:
        lib.attrsets.nameValuePair "nixcord-${spec.name}" (
          lib.hm.dag.entryAfter [ "writeBoundary" ] ''
            dest=${lib.strings.escapeShellArg spec.dest}
            src=${lib.strings.escapeShellArg spec.src}
            if [ -L "$dest" ]; then
              rm "$dest"
            elif [ -e "$dest" ]; then
              chmod u+w "$dest" 2>/dev/null || true
            fi
            ${install} -Dm644 "$src" "$dest"
          ''
        )
      );

      activationScripts = common.mkActivationScripts (
        script: lib.hm.dag.entryAfter [ "writeBoundary" ] script
      );

    in
    lib.modules.mkMerge [
      {
        programs.nixcord = {
          user = lib.modules.mkDefault config.home.username;
          homeDirectory = lib.modules.mkDefault config.home.homeDirectory;
          xdgConfigHome = lib.modules.mkDefault config.xdg.configHome;
        }
        // mkConfigDirs cfg (
          if pkgs.stdenvNoCC.isLinux then
            config.xdg.configHome
          else
            "${config.home.homeDirectory}/Library/Application Support"
        );
      }
      {
        programs.nixcord.finalPackage = packages.final;

        home = {
          packages = packages.installed;
          file = homeFiles;
          activation = writableHomeActivations;
        };
      }
      (lib.modules.mkIf cfg.discord.enable {
        home.activation.disableDiscordUpdates = activationScripts.disableDiscordUpdates;
        home.activation.fixDiscordModules = activationScripts.fixDiscordModules;
      })
      (lib.modules.mkIf cfg.dorion.enable {
        home.activation.setupDorionVencordSettings = activationScripts.setupDorionVencordSettings;
      })
    ]
  );
}
