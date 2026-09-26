{
  programs.nixcord = {
    enable = true;

    # Choose one mod for Discord.
    discord.vencord.enable = true;
    # discord.equicord.enable = true;

    # Also install Vesktop. Disable discord.enable to use Vesktop alone.
    vesktop.enable = true;

    quickCss = "body { --font-primary: monospace; }";
    config = {
      useQuickCss = true;
      plugins = {
        hideMedia.enable = true;
        ignoreActivities = {
          enable = true;
          ignorePlaying = true;
        };
      };
    };
  };
}
