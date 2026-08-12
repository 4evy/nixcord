{
  programs.nixcord = {
    # Popular forges have short aliases
    userPlugins = {
      githubPlugin = "github:someUser/githubPlugin/abc123def456...";
      codebergPlugin = "codeberg:someUser/codebergPlugin/abc123def456...";

      # Every other or self-hosted forge uses a generic Git URL
      selfHostedPlugin = "git+https://git.example.org/someUser/selfHostedPlugin.git?rev=abc123def456...";

      # Local path (requires --impure with flakes)
      myLocalPlugin = "/home/user/projects/myPlugin";

      # Nix path literal
      anotherPlugin = ./plugins/anotherPlugin;
    };

    extraConfig.plugins = {
      githubPlugin.enable = true;
      codebergPlugin.enable = true;
      selfHostedPlugin.enable = true;
      myLocalPlugin.enable = true;
      anotherPlugin.enable = true;
    };
  };
}
