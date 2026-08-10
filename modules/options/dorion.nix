{ lib, pkgs, ... }:
let
  jsonFormat = pkgs.formats.json { };
  mkEnableTrueOption = name: lib.options.mkEnableOption name // { default = true; };
in
{
  options.programs.nixcord.dorion = {
    enable = lib.options.mkEnableOption "Dorion";
    installPackage = lib.options.mkOption {
      type = lib.types.bool;
      default = true;
      description = "Whether to install the final Dorion package.";
    };
    package = lib.options.mkPackageOption pkgs "dorion" { };
    configDir = lib.options.mkOption {
      type = lib.types.path;
      description = "Config directory for Dorion.";
    };
    theme = lib.options.mkOption {
      type = lib.types.str;
      default = "none";
      description = "Theme to use in Dorion.";
      example = "ClearVision";
    };
    themes = lib.options.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [ "none" ];
      description = "List of available themes.";
    };
    zoom = lib.options.mkOption {
      type = lib.types.str;
      default = "1.0";
      description = "Zoom level for the client.";
      example = "1.25";
    };
    blur = lib.options.mkOption {
      type = lib.types.enum [
        "none"
        "blur"
        "acrylic"
      ];
      default = "none";
      description = "Window blur effect type.";
    };
    blurCss = mkEnableTrueOption "CSS blur effects";
    useNativeTitlebar = lib.options.mkEnableOption "native window titlebar";
    startMaximized = lib.options.mkEnableOption "starting Dorion maximized";
    disableHardwareAccel = lib.options.mkEnableOption "disabling hardware acceleration";
    sysTray = lib.options.mkEnableOption "system tray integration";
    trayIconEnabled = mkEnableTrueOption "the tray icon";
    openOnStartup = lib.options.mkEnableOption "opening Dorion on system startup";
    startupMinimized = lib.options.mkEnableOption "starting minimized to tray";
    multiInstance = lib.options.mkEnableOption "multiple Dorion instances";
    pushToTalk = lib.options.mkEnableOption "push-to-talk";
    pushToTalkKeys = lib.options.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [ "RControl" ];
      description = "Keys for push-to-talk activation.";
      example = [
        "RControl"
        "F1"
      ];
    };
    updateNotify = mkEnableTrueOption "update notifications";
    desktopNotifications = lib.options.mkEnableOption "desktop notifications";
    unreadBadge = mkEnableTrueOption "the unread message badge";
    win7StyleNotifications = lib.options.mkEnableOption "Windows 7 style notifications";
    cacheCss = lib.options.mkEnableOption "CSS caching for faster loading";
    autoClearCache = lib.options.mkEnableOption "automatic cache clearing on startup";
    clientType = lib.options.mkOption {
      type = lib.types.str;
      default = "default";
      description = "Discord client type to emulate.";
    };
    clientMods = lib.options.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [
        "Shelter"
        "Vencord"
      ];
      description = "Client modifications to enable.";
    };
    clientPlugins = mkEnableTrueOption "client plugins";
    profile = lib.options.mkOption {
      type = lib.types.str;
      default = "default";
      description = "Profile name to use.";
    };
    streamerModeDetection = lib.options.mkEnableOption "streamer mode detection";
    rpcServer = lib.options.mkEnableOption "RPC server";
    rpcProcessScanner = mkEnableTrueOption "the RPC process scanner";
    rpcIpcConnector = mkEnableTrueOption "the RPC IPC connector";
    rpcWebsocketConnector = mkEnableTrueOption "the RPC WebSocket connector";
    rpcSecondaryEvents = mkEnableTrueOption "RPC secondary events";
    proxyUri = lib.options.mkOption {
      type = lib.types.str;
      default = "";
      description = "Proxy URI to use for connections.";
      example = "socks5://127.0.0.1:1080";
    };
    keybinds = lib.options.mkOption {
      type = lib.types.attrsOf jsonFormat.type;
      default = { };
      description = "Custom keybind mappings.";
    };
    keybindsEnabled = mkEnableTrueOption "custom keybinds";
    extraSettings = lib.options.mkOption {
      type = lib.types.attrsOf jsonFormat.type;
      default = { };
      description = "Additional settings to merge into config.json. These override any conflicting auto-generated settings.";
    };
  };
}
