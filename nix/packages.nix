{
  pkgs,
  revision ? "main",
}:
let
  inherit (pkgs) lib;

  discordAvailable = lib.meta.availableOn pkgs.stdenv.hostPlatform pkgs.discord;
  discordVariants = {
    discord = { };
    discord-ptb.branch = "ptb";
    discord-canary.branch = "canary";
    discord-development.branch = "development";
  };
  openasar = pkgs.openasar;
  discordPackages = lib.attrsets.optionalAttrs discordAvailable (
    lib.attrsets.mapAttrs (
      _name: args: pkgs.callPackage ../pkgs/discord ({ inherit openasar; } // args)
    ) discordVariants
  );
  docsArtifacts = import ../docs {
    inherit pkgs revision;
  };
  docsSystems = [
    "x86_64-linux"
    "aarch64-darwin"
  ];
  docsPackages =
    lib.attrsets.optionalAttrs (builtins.elem pkgs.stdenv.hostPlatform.system docsSystems)
      {
        docs = docsArtifacts.html;
      };
  goofcordPackages = lib.attrsets.optionalAttrs (pkgs ? goofcord) {
    goofcord = pkgs.callPackage ../pkgs/goofcord.nix { };
  };
in
discordPackages
// docsPackages
// goofcordPackages
// {
  inherit openasar;

  vencord = pkgs.callPackage ../pkgs/vencord.nix { };
  equicord = pkgs.callPackage ../pkgs/equicord.nix { };
  generate = pkgs.callPackage ../pkgs/generate-options.nix { };
  docs-json = docsArtifacts.json;
}
