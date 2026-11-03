{ lib, ... }:
let
  pluginSchema = import ../plugins/schema/schema.nix;
  plugins = lib.concatMap lib.attrValues (lib.attrValues pluginSchema);
  uiElementNames =
    group: lib.unique (lib.concatMap (plugin: plugin.uiElements.${group} or [ ]) plugins);

  uiElementOptions =
    { name, ... }:
    {
      options.enable = lib.options.mkEnableOption "the ${name} plugin UI element" // {
        description = ''
          Whether to enable this plugin UI element.
          Leaving this element unconfigured preserves its upstream default.
        '';
      };
    };

  # Expose a real submodule schema to editors, but merge its freeform dictionary
  # directly so discovering named IDs never instantiates unconfigured entries
  uiElementsType =
    moduleType:
    let
      attrsType = moduleType.nestedTypes.freeformType;
      functor = moduleType.functor // {
        type = payload: uiElementsType (moduleType.functor.type payload);
      };
    in
    moduleType
    // {
      inherit (attrsType) check merge emptyValue;
      substSubModules = modules: uiElementsType (moduleType.substSubModules modules);
      typeMerge = lib.types.defaultTypeMerge functor;
      inherit functor;
    };

  uiElementsOption =
    group: description:
    let
      elemType = lib.types.submodule uiElementOptions;
    in
    lib.options.mkOption {
      type = uiElementsType (
        lib.types.submodule {
          freeformType = lib.types.attrsOf elemType;
          options = lib.genAttrs (uiElementNames group) (
            name:
            lib.options.mkOption {
              type = elemType;
              description = "UI visibility for the ${name} plugin.";
            }
          );
        }
      );
      default = { };
      description = ''
        Plugin UI elements to configure for ${description}.
        Unconfigured elements keep their upstream defaults.
        Arbitrary names from user plugins are also supported.
      '';
      example = {
        AddAttachments.enable = false;
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
        chatBarButtons = uiElementsOption "chatBarButtons" "chat bar buttons";
        messagePopoverButtons = uiElementsOption "messagePopoverButtons" "message popover buttons";
      };
      plugins = import ../plugins/options/options.nix { inherit lib; };
    };
  };
}
