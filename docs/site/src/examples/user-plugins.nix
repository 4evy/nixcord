{
  programs.nixcord = {
    # GitHub repo at a specific commit
    userPlugins = {
      someCoolPlugin = "github:someUser/someCoolPlugin/abc123def456...";

      # Local path (requires --impure with flakes)
      myLocalPlugin = "/home/user/projects/myPlugin";

      # Nix path literal
      anotherPlugin = ./plugins/anotherPlugin;
    };

    extraConfig.plugins = {
      someCoolPlugin.enable = true;
      myLocalPlugin.enable = true;
      anotherPlugin.enable = true;
    };
  };
}
