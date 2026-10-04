{
  inputs,
  pkgs,
  packages,
}:
let
  discordAvailable = pkgs.lib.meta.availableOn pkgs.stdenv.hostPlatform (
    pkgs.callPackage ../../pkgs/discord/metadata.nix { }
  );
  discordVariants = {
    discord-with-vencord = {
      withVencord = true;
    };
    discord-with-vencord-openasar = {
      withVencord = true;
      withOpenASAR = true;
    };
    discord-with-equicord = {
      withEquicord = true;
    };
    discord-with-krisp = {
      withKrisp = true;
    };
  };
  discordIntegrationChecks = pkgs.lib.attrsets.optionalAttrs discordAvailable (
    pkgs.lib.mapAttrs (
      _: args:
      pkgs.callPackage ../../pkgs/discord (
        {
          inherit (packages) vencord equicord openasar;
        }
        // args
      )
    ) discordVariants
    // {
      discord-multiple-branches-with-equicord-krisp =
        let
          branches = [
            "stable"
            "ptb"
            "canary"
          ];
        in
        pkgs.buildEnv {
          name = "nixcord-discord-multiple-branches-with-equicord-krisp";
          paths = map (
            branch:
            (pkgs.callPackage ../../pkgs/discord {
              inherit branch;
              withEquicord = true;
              withKrisp = true;
              inherit (packages) equicord;
            })
          ) branches;
        };
    }
  );
  nonFlake = import ../.. { inherit pkgs; };
  nonFlakeNixos = import (pkgs.lib.path.append pkgs.path "nixos/lib/eval-config.nix") {
    system = "x86_64-linux";
    modules = [ nonFlake.nixosModules.nixcord ];
  };
  nonFlakeInterface =
    assert nonFlake.packages.vencord.drvPath == packages.vencord.drvPath;
    assert nonFlake.packages.goofcord.drvPath == packages.goofcord.drvPath;
    assert nonFlake ? homeModules;
    assert nonFlake ? nixosModules;
    assert nonFlake ? darwinModules;
    assert !nonFlakeNixos.config.programs.nixcord.enable;
    pkgs.runCommandLocal "nixcord-non-flake-interface" { } "touch $out";
in
{
  checks =
    import ../../modules/tests { inherit pkgs; }
    // discordIntegrationChecks
    // {
      non-flake-interface = nonFlakeInterface;
      hm-writable-files = import ../../modules/tests/hm-writable-files.nix {
        inherit pkgs;
        inherit (inputs) home-manager;
      };
      module-integration = import ../../modules/tests/module-integration.nix {
        inherit pkgs;
        inherit (inputs) home-manager nix-darwin;
      };
      flake-interface = import ../../modules/tests/flake-interface.nix {
        inherit pkgs inputs;
        inherit (inputs) self;
      };
    };
}
