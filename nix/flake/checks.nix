{
  inputs,
  pkgs,
  packages,
}:
let
  # Host modules follow inputs.nixpkgs; the independently pinned Nixcord package
  # set may target a different release, which nix-darwin rejects as a host
  hostPkgs =
    if inputs.nixpkgs.outPath == inputs.nixpkgs-nixcord.outPath then
      pkgs
    else
      import inputs.nixpkgs {
        inherit (pkgs.stdenv.hostPlatform) system;
        config.allowUnfree = true;
      };
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
        pkgs = hostPkgs;
        inherit (inputs) home-manager;
      };
      module-integration = import ../../modules/tests/module-integration.nix {
        pkgs = hostPkgs;
        inherit (inputs) home-manager nix-darwin;
      };
      flake-interface = import ../../modules/tests/flake-interface.nix {
        pkgs = hostPkgs;
        inherit inputs;
        inherit (inputs) self;
      };
    };
}
