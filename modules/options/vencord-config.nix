{ lib, ... }:
let
  inherit (lib) mkEnableOption mkOption types;

  uiElementOptions =
    { name, ... }:
    {
      options.enable = mkEnableOption "the ${name} plugin UI element";
    };

  uiElementsOption =
    description:
    mkOption {
      type = types.attrsOf (types.submodule uiElementOptions);
      default = { };
      description = "Plugin UI elements to configure for ${description}.";
      example = {
        MessageLatency.enable = false;
      };
    };
in
{
  options.programs.nixcord = {
    quickCss = mkOption {
      type = types.str;
      default = "";
      description = "Quick CSS to inject into the client.";
    };
    config = {
      notifyAboutUpdates = mkEnableOption "update notifications";
      autoUpdate = mkEnableOption "automatic Vencord updates";
      autoUpdateNotification = mkEnableOption "auto-update notifications";
      useQuickCss = mkEnableOption "the quick CSS file";
      themeLinks = mkOption {
        type = types.listOf types.str;
        default = [ ];
        description = "A list of URLs to online Vencord themes.";
        example = [ "https://raw.githubusercontent.com/rose-pine/discord/main/rose-pine.theme.css" ];
      };
      themes = mkOption {
        type = types.attrsOf (
          types.oneOf [
            types.lines
            types.path
          ]
        );
        default = { };
        description = ''
          Themes to add. Enable them by setting
          `programs.nixcord.config.enabledThemes` to `[ "THEME_NAME.css" ]`.
        '';
      };
      enabledThemes = mkOption {
        type = types.listOf types.str;
        default = [ ];
        description = "A list of themes to enable from the themes directory.";
        example = [ "my-theme.css" ];
      };
      enabledThemeLinks = mkOption {
        type = types.listOf types.str;
        default = [ ];
        description = "A list of online Vencord theme URLs to enable.";
        example = [ "https://raw.githubusercontent.com/rose-pine/discord/main/rose-pine.theme.css" ];
      };
      enableReactDevtools = mkEnableOption "React developer tools";
      frameless = mkEnableOption "frameless client window";
      transparent = mkEnableOption "client transparency";
      disableMinSize = mkEnableOption "disabling the minimum window size";
      uiElements = {
        chatBarButtons = uiElementsOption "chat bar buttons";
        messagePopoverButtons = uiElementsOption "message popover buttons";
      };
      plugins = lib.foldl' lib.recursiveUpdate { } [
        (import ../plugins/mkPluginOptions.nix {
          inherit lib;
          file = ../plugins/shared.json;
        })
        (import ../plugins/mkPluginOptions.nix {
          inherit lib;
          file = ../plugins/vencord.json;
        })
        (import ../plugins/mkPluginOptions.nix {
          inherit lib;
          file = ../plugins/equicord.json;
        })
      ];
    };
  };
}
