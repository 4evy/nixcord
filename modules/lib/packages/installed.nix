{ lib }:
let
  inherit (import ../discord.nix { inherit lib; }) getDiscordBranches;

  mkInstalledPackages =
    cfg: finalPackages:
    lib.lists.optionals (cfg.discord.enable && cfg.discord.installPackage) (
      map (branch: finalPackages.discordBranches.${branch}) (getDiscordBranches cfg)
    )
    ++
      lib.lists.concatMap
        (
          name:
          lib.lists.optional (
            cfg.${name}.enable && cfg.${name}.installPackage && finalPackages.${name} != null
          ) finalPackages.${name}
        )
        [
          "vesktop"
          "equibop"
          "goofcord"
          "dorion"
          "legcord"
        ];

in
{
  inherit mkInstalledPackages;
}
