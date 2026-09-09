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
      _name: args: pkgs.callPackage ./discord ({ inherit openasar; } // args)
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
    goofcord = pkgs.callPackage ./goofcord { };
  };
in
discordPackages
// docsPackages
// goofcordPackages
// {
  inherit openasar;

  vencord = pkgs.callPackage ./vencord { };
  equicord = pkgs.callPackage ./equicord { };
  generate = pkgs.callPackage ./generate-options { };
  docs-json = docsArtifacts.json;
}
