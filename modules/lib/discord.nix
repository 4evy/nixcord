{ lib }:
let
  branchDirName = {
    stable = "discord";
    ptb = "discordptb";
    canary = "discordcanary";
    development = "discorddevelopment";
  };

  getDiscordBranches = cfg: cfg.discord.branches;

  getPrimaryDiscordBranch = cfg: builtins.head (getDiscordBranches cfg);

  getDiscordConfigDir =
    cfg: branch:
    if branch == getPrimaryDiscordBranch cfg then
      toString cfg.discord.configDir
    else
      "${builtins.dirOf (toString cfg.discord.configDir)}/${branchDirName.${branch}}";

  getDiscordConfigDirs = cfg: map (getDiscordConfigDir cfg) (getDiscordBranches cfg);
in
{
  inherit
    branchDirName
    getDiscordBranches
    getPrimaryDiscordBranch
    getDiscordConfigDir
    getDiscordConfigDirs
    ;
}
