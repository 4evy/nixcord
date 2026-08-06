{
  programs.nixcord.goofcord = {
    enable = true;

    # Defaults to Vencord; use "equicord" for Equicord's larger plugin set.
    clientMod = "vencord";

    settings = {
      minimizeToTray = true;
      hardwareAcceleration = true;
    };
  };
}
