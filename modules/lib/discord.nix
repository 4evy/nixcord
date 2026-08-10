{ lib }:
let
  branchDirName = {
    stable = "discord";
    ptb = "discordptb";
    canary = "discordcanary";
    development = "discorddevelopment";
  };

  disabledUpdateSettings = {
    SKIP_HOST_UPDATE = true;
    SKIP_MODULE_UPDATE = true;
    USE_NEW_UPDATER = false;
  };

  packageSupportsOverride =
    package: argument:
    let
      override = package.override or null;
      overrideArgs =
        if override != null && lib.trivial.isFunction override then
          lib.trivial.functionArgs override
        else
          { };
    in
    overrideArgs.${argument} or false;

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
    disabledUpdateSettings
    packageSupportsOverride
    getDiscordBranches
    getPrimaryDiscordBranch
    getDiscordConfigDir
    getDiscordConfigDirs
    ;
}
