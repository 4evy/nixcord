{
  programs.nixcord = {
    # Replace COMMIT with a full 40-character revision.
    userPlugins = {
      githubPlugin = "github:someUser/githubPlugin/COMMIT";
      codebergPlugin = "codeberg:someUser/codebergPlugin/COMMIT";

      # Use a Git URL for other hosts.
      selfHostedPlugin = "git+https://git.example.org/someUser/selfHostedPlugin.git?rev=COMMIT";

      # An absolute path string requires --impure with flakes.
      myLocalPlugin = "/home/user/projects/myPlugin";

      # A path literal is resolved relative to this file.
      anotherPlugin = ./plugins/anotherPlugin;
    };

    # Use the name declared by each plugin, which may differ from its repository.
    extraConfig.plugins = {
      githubPlugin.enable = true;
      codebergPlugin.enable = true;
      selfHostedPlugin.enable = true;
      myLocalPlugin.enable = true;
      anotherPlugin.enable = true;
    };
  };
}
