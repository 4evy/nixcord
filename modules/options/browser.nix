{
  config,
  lib,
  pkgs,
  options,
  ...
}:
let
  cfg = config.programs.nixcord;
  inherit (import ../lib { inherit lib; }) mkPluginKit;
  inherit
    (import ../lib/normalization/normalization.nix {
      inherit lib;
      inherit (cfg) parseRules;
    })
    mkVencordCfg
    ;
  pluginKit = mkPluginKit { inherit cfg mkVencordCfg; };
  # Preserve browser settings that were not explicitly declared in Nix.
  declaredConfig =
    opts:
    lib.attrsets.concatMapAttrs (
      name: option:
      if lib.options.isOption option then
        lib.attrsets.optionalAttrs (option.highestPrio < 1500) { ${name} = option.value; }
      else
        lib.attrsets.filterAttrs (_: value: value != { }) { ${name} = declaredConfig option; }
    ) opts;
  normalize =
    extraConfig: mkVencordCfg (pluginKit.migrateFreeformConfigFor cfg.browser.client extraConfig);
in
{
  options.programs.nixcord.browser = {
    enable = lib.options.mkEnableOption "a configured Chromium browser extension";
    client = lib.options.mkOption {
      type = lib.types.enum [
        "vencord"
        "equicord"
      ];
      default = "vencord";
      description = "Client mod to build for the browser.";
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
    finalPackage = lib.options.mkOption {
      type = lib.types.package;
      readOnly = true;
      description = "Configured unpacked Chromium extension. Add this to your browser's extension paths.";
    };
  };

  config = lib.modules.mkIf (cfg.enable && cfg.browser.enable) {
    programs.nixcord.browser.finalPackage = import ../lib/browser.nix {
      inherit pkgs lib cfg;
      quickCss = if options.programs.nixcord.quickCss.highestPrio < 1500 then cfg.quickCss else null;
      settings = lib.lists.foldl' lib.attrsets.recursiveUpdate { } (
        map normalize [
          (pluginKit.filterPluginsFor cfg.browser.client (declaredConfig options.programs.nixcord.config))
          cfg.extraConfig
          cfg.browser.extraConfig
        ]
      );
    };
  };
}
