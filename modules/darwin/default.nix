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
  _class = "darwin";

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

      configuredHome = lib.attrByPath [ cfg.user "home" ] null config.users.users;
      homeDir = if configuredHome != null then configuredHome else "/Users/${cfg.user}";
      basePath = "${homeDir}/Library/Application Support";

      activationScripts = common.mkActivationScripts (script: ''
        sudo --user=${lib.escapeShellArg cfg.user} -- ${pkgs.runtimeShell} -c ${lib.escapeShellArg script}
      '');

      install = lib.getExe' pkgs.coreutils "install";

    in
    mkMerge [
      {
        programs.nixcord = (mkConfigDirs cfg basePath) // {
          homeDirectory = lib.mkDefault homeDir;
          xdgConfigHome = lib.mkDefault "${homeDir}/.config";
          # Darwin dorion uses ~/.config instead of ~/Library/Application Support
          dorion.configDir = lib.mkDefault "${homeDir}/.config/dorion";
        };
      }
      {
        programs.nixcord.finalPackage = packages.final;

        environment.systemPackages = packages.installed;
      }
      (mkIf cfg.discord.enable {
        # nix-darwin executes a fixed set of activation stages; custom
        # activation attribute names are not included in the final script.
        system.activationScripts.applications.text = lib.mkAfter ''
          ${activationScripts.disableDiscordUpdates}
          ${activationScripts.fixDiscordModules}
        '';
      })
      (mkIf (fileSpecs != [ ]) {
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

            ${fileCopyCommands}
          ''
        );
      })
      (mkIf cfg.dorion.enable {
        system.activationScripts.applications.text = lib.mkAfter activationScripts.setupDorionVencordSettings;
      })
    ]
  );
}
