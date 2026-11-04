{
  config,
  lib,
  pkgs,
  options,
  ...
}:
let
  cfg = config.programs.nixcord;
  inherit (import ../lib { inherit lib; }) mkPluginKit configFromOptions;
  inherit
    (import ../lib/normalization/normalization.nix {
      inherit lib;
      inherit (cfg) parseRules;
      client = cfg.browser.client;
    })
    mkVencordCfg
    ;
  pluginKit = mkPluginKit {
    inherit cfg mkVencordCfg;
    configOptions = options.programs.nixcord.config;
  };
  # Preserve browser settings that were not explicitly declared in Nix
  declaredConfig = configFromOptions (option: option.highestPrio < 1500);
  normalize =
    extraConfig: mkVencordCfg (pluginKit.migrateFreeformConfigFor cfg.browser.client extraConfig);
  settings = lib.lists.foldl' lib.attrsets.recursiveUpdate { } (
    map normalize [
      (pluginKit.filterPluginsFor cfg.browser.client (declaredConfig options.programs.nixcord.config))
      cfg.extraConfig
      cfg.browser.extraConfig
    ]
  );
in
{
  options.programs.nixcord.browser = {
    enable = lib.options.mkEnableOption "browser extension configuration";
    client = lib.options.mkOption {
      type = lib.types.enum [
        "vencord"
        "equicord"
      ];
      default = "vencord";
      description = "Client mod to configure for the browser.";
    };
    package = lib.options.mkOption {
      type = lib.types.package;
      default = cfg.discord.${cfg.browser.client}.package.override { buildWebExtension = true; };
      defaultText = lib.options.literalExpression "programs.nixcord.discord.<client>.package.override { buildWebExtension = true; }";
      description = "Browser extension package to configure with settings, CSS, and user plugins.";
    };
    extraConfig = lib.options.mkOption {
      type = lib.types.attrsOf (pkgs.formats.json { }).type;
      default = { };
      description = "Browser-only mod settings overriding config and extraConfig. Native client overrides are excluded.";
    };
    settingsFile = lib.options.mkOption {
      type = lib.types.path;
      readOnly = true;
      description = ''
        Importable settings backup for an existing Vencord or Equicord browser
        extension, including Quick CSS and online theme settings. Import it
        through the mod's Backup & Restore page, then reload Discord.

        Generation does not build or install an extension or modify a browser
        profile. The backup always includes Quick CSS, even when unset.
        Importing an empty Quick CSS value clears Vencord's existing CSS.
        Equicord ignores empty Quick CSS.

        Local theme files and user plugin code are not included. Use
        finalPackage to bundle them in a configured Chromium extension.
        Re-import the backup after changing your Nix configuration.
      '';
    };
    finalPackage = lib.options.mkOption {
      type = lib.types.package;
      readOnly = true;
      description = "Configured unpacked Chromium extension. Add this to your browser's extension paths.";
    };
  };

  config = lib.modules.mkIf (cfg.enable && cfg.browser.enable) {
    programs.nixcord.browser.settingsFile =
      (pkgs.formats.json { }).generate "nixcord-${cfg.browser.client}-browser-settings.json"
        {
          settings = builtins.removeAttrs settings [ "themes" ];
          # Vencord requires both backup fields, even when Quick CSS is empty
          quickCss = cfg.quickCss;
        };
    programs.nixcord.browser.finalPackage = import ../lib/browser.nix {
      inherit
        pkgs
        lib
        cfg
        settings
        ;
      quickCss = if options.programs.nixcord.quickCss.highestPrio < 1500 then cfg.quickCss else null;
    };
  };
}
