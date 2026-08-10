{
  config,
  lib,
  options,
  pkgs,
  nixcordPkgs ? { },
  ...
}:
let
  inherit (lib) mkEnableOption mkOption types;
  branchType = types.enum [
    "stable"
    "ptb"
    "canary"
    "development"
  ];
  jsonFormat = pkgs.formats.json { };
  vencordPackage = pkgs.callPackage ../../pkgs/vencord.nix { };
  equicordPackage = pkgs.callPackage ../../pkgs/equicord.nix { };
  openasarPackage = pkgs.openasar;
  selectedNixcordPkgs = if config.programs.nixcord.useGlobalPkgs then { } else nixcordPkgs;

  branchOption = options.programs.nixcord.discord.branch;
  branchWasDefined = lib.any (
    file: !(builtins.elem file branchOption.declarations)
  ) branchOption.files;
in
{
  options.programs.nixcord.discord = {
    enable = mkOption {
      type = types.bool;
      default = true;
      description = "Whether to enable Discord. Disable to only install Vesktop.";
      example = false;
    };
    installPackage = mkOption {
      type = types.bool;
      default = true;
      description = "Whether to install the final Discord package.";
    };
    package = mkOption {
      type = types.package;
      default = pkgs.callPackage ../../pkgs/discord (
        {
          openasar = selectedNixcordPkgs.openasar or openasarPackage;
        }
        // lib.optionalAttrs (pkgs.stdenvNoCC.isLinux && lib.versionOlder lib.version "25") {
          libgbm = pkgs.mesa;
        }
      );
      defaultText = lib.literalExpression "pkgs.callPackage ../../pkgs/discord { }";
      description = "The Discord package to use.";
    };
    # TODO: Remove programs.nixcord.discord.branch no earlier than 2026-08-20.
    branch = mkOption {
      type = branchType;
      default = "stable";
      visible = false;
      description = "Deprecated compatibility shim for `programs.nixcord.discord.branches`.";
      example = "canary";
    };
    branches = mkOption {
      type = types.nonEmptyListOf branchType;
      default = [ "stable" ];
      apply = lib.unique;
      description = ''
        The Discord branches to install and manage simultaneously. All selected
        branches use the same Vencord or Equicord configuration and Discord
        package options. The first branch is exposed as `finalPackage.discord`
        and determines the default value of `discord.configDir`.
      '';
      example = [
        "stable"
        "ptb"
        "canary"
      ];
    };
    configDir = mkOption {
      type = types.path;
      description = "Config directory for Discord.";
    };
    vencord = {
      enable = mkOption {
        type = types.bool;
        default = false;
        description = "Whether to enable Vencord for Discord (non-Vesktop).";
      };
      package = mkOption {
        type = types.package;
        default = selectedNixcordPkgs.vencord or vencordPackage;
        defaultText = lib.literalExpression "pkgs.callPackage ../../pkgs/vencord.nix { }";
        description = "The Vencord package to use.";
      };
    };
    equicord = {
      enable = mkEnableOption "Equicord (alternative to Vencord)";
      package = mkOption {
        type = types.package;
        default = selectedNixcordPkgs.equicord or equicordPackage;
        defaultText = lib.literalExpression "pkgs.callPackage ../../pkgs/equicord.nix { }";
        description = "The Equicord package to use.";
      };
    };
    silenceNoModClientWarning = mkOption {
      type = types.bool;
      default = false;
      example = true;
      description = ''
        Whether to acknowledge and silence the warning shown when Discord is
        enabled without Vencord or Equicord.
      '';
    };
    openASAR.enable = mkOption {
      type = types.bool;
      default = true;
      description = "Whether to enable OpenASAR for Discord (non-Vesktop).";
    };
    krisp.enable = mkEnableOption "Krisp noise cancellation";
    # TODO: Remove programs.nixcord.discord.autoscroll.enable after the
    # deprecation window; use programs.nixcord.discord.commandLineArgs instead.
    autoscroll.enable = mkOption {
      type = types.bool;
      default = false;
      visible = false;
      description = "Deprecated shim for adding the MiddleClickAutoscroll command line argument.";
    };
    commandLineArgs = mkOption {
      type = types.listOf types.str;
      default = [ ];
      description = "Additional command line arguments to pass to Discord.";
      example = [
        "--enable-features=VaapiVideoDecoder,MiddleClickAutoscroll"
        "--ozone-platform-hint=auto"
        "--enable-wayland-ime"
      ];
    };
    settings = mkOption {
      type = types.attrsOf jsonFormat.type;
      default = { };
      description = "Settings to be placed in Discord's settings.json. Set atomically; the entire attrset replaces any previous definition.";
      example = {
        openasar.setup = true;
      };
    };
  };

  config.programs.nixcord.discord.branches = lib.mkIf branchWasDefined (
    lib.mkDefault [ config.programs.nixcord.discord.branch ]
  );
}
