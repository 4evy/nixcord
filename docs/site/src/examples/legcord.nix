{
  programs.nixcord = {
    enable = true;
    discord.enable = false;
    legcord = {
      enable = true;

      # Choose one bundled mod; it includes userPlugins.
      vencord.enable = true;
      # equicord.enable = true;

      settings = {
        channel = "stable";
        tray = "dynamic";
        minimizeToTray = true;
        doneSetup = true;
      };
    };
  };
}
