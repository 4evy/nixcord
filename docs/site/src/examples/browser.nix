{
  programs.nixcord = {
    enable = true;
    discord.enable = false;

    browser = {
      enable = true;
      client = "vencord"; # Or "equicord"
    };

    config.plugins.hideMedia.enable = true;
  };
}
