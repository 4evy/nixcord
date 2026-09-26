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
      description = "CSS written to the client's Quick CSS file. Set `config.useQuickCss = true` to load it.";
    };
    config = {
      notifyAboutUpdates = lib.options.mkEnableOption "update notifications";
      autoUpdate = lib.options.mkEnableOption "automatic Vencord updates";
      autoUpdateNotification = lib.options.mkEnableOption "auto-update notifications";
      useQuickCss = lib.options.mkEnableOption "the quick CSS file";
      themeLinks = lib.options.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [ ];
        description = "URLs of online themes to load.";
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
          Named themes, each supplied as CSS text or a Nix path. A theme named
          `myTheme` is written as `myTheme.css`; add that filename to
          `programs.nixcord.config.enabledThemes` to load it.
        '';
      };
      enabledThemes = lib.options.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [ ];
        description = "Theme filenames to load from the themes directory, including the `.css` extension.";
        example = [ "my-theme.css" ];
      };
      enabledThemeLinks = lib.options.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [ ];
        description = "Online theme URLs marked as enabled in the mod settings.";
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
      plugins = lib.lists.foldl' lib.attrsets.recursiveUpdate { } (
        map (file: import ../plugins/mkPluginOptions.nix { inherit lib file; }) [
          ../plugins/shared.json
          ../plugins/vencord.json
          ../plugins/equicord.json
        ]
      );
    };
  };
}
