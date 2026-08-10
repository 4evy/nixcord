{ lib, ... }:
let

  uiElementOptions =
    { name, ... }:
    {
      options.enable = lib.options.mkEnableOption "the ${name} plugin UI element";
    };

  uiElementsOption =
    description:
    lib.options.mkOption {
      type = lib.types.attrsOf (lib.types.submodule uiElementOptions);
      default = { };
      description = "Plugin UI elements to configure for ${description}.";
      example = {
        MessageLatency.enable = false;
      };
    };
in
{
  options.programs.nixcord = {
    quickCss = lib.options.mkOption {
      type = lib.types.str;
      default = "";
      description = "Quick CSS to inject into the client.";
    };
    config = {
      notifyAboutUpdates = lib.options.mkEnableOption "update notifications";
      autoUpdate = lib.options.mkEnableOption "automatic Vencord updates";
      autoUpdateNotification = lib.options.mkEnableOption "auto-update notifications";
      useQuickCss = lib.options.mkEnableOption "the quick CSS file";
      themeLinks = lib.options.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [ ];
        description = "A list of URLs to online Vencord themes.";
        example = [ "https://raw.githubusercontent.com/rose-pine/discord/main/rose-pine.theme.css" ];
      };
      themes = lib.options.mkOption {
        type = lib.types.attrsOf (
          lib.types.oneOf [
            lib.types.lines
            lib.types.path
          ]
        );
        default = { };
        description = ''
          Themes to add. Enable them by setting
          `programs.nixcord.config.enabledThemes` to `[ "THEME_NAME.css" ]`.
        '';
      };
      enabledThemes = lib.options.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [ ];
        description = "A list of themes to enable from the themes directory.";
        example = [ "my-theme.css" ];
      };
      enabledThemeLinks = lib.options.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [ ];
        description = "A list of online Vencord theme URLs to enable.";
        example = [ "https://raw.githubusercontent.com/rose-pine/discord/main/rose-pine.theme.css" ];
      };
      enableReactDevtools = lib.options.mkEnableOption "React developer tools";
      frameless = lib.options.mkEnableOption "frameless client window";
      transparent = lib.options.mkEnableOption "client transparency";
      disableMinSize = lib.options.mkEnableOption "disabling the minimum window size";
      uiElements = {
        chatBarButtons = uiElementsOption "chat bar buttons";
        messagePopoverButtons = uiElementsOption "message popover buttons";
      };
      plugins = lib.lists.foldl' lib.attrsets.recursiveUpdate { } [
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
