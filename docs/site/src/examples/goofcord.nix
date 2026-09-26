{
  programs.nixcord = {
    enable = true;
    discord.enable = false;
    goofcord = {
      enable = true;

      # Use "equicord" to build with Equicord instead.
      clientMod = "vencord";

      settings = {
        minimizeToTray = true;
        hardwareAcceleration = true;
      };
    };
  };
}
