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
        ;

      install = lib.getExe' pkgs.coreutils "install";

      homeFiles = lib.genAttrs' (lib.filter (spec: !spec.writable) fileSpecs) (
        spec:
        lib.nameValuePair spec.dest {
          source = spec.src;
        }
      );
      writableHomeActivations = lib.genAttrs' (lib.filter (spec: spec.writable) fileSpecs) (
        spec:
        lib.nameValuePair "nixcord-${spec.name}" (
          lib.hm.dag.entryAfter [ "writeBoundary" ] ''
            dest=${lib.escapeShellArg spec.dest}
            src=${lib.escapeShellArg spec.src}
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
    mkMerge ([
      {
        programs.nixcord = {
          user = lib.mkDefault config.home.username;
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

        home.packages = packages.installed;
        home.file = homeFiles;
        home.activation = writableHomeActivations;
      }
      (mkIf cfg.discord.enable {
        home.activation.disableDiscordUpdates = activationScripts.disableDiscordUpdates;
        home.activation.fixDiscordModules = activationScripts.fixDiscordModules;
      })
      (mkIf cfg.dorion.enable {
        home.activation.setupDorionVencordSettings = activationScripts.setupDorionVencordSettings;
      })
    ])
  );
}
