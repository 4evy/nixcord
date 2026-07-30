{
  perSystem =
    {
      config,
      pkgs,
      ...
    }:
    let
      inherit (config) packages;
      discordAvailable = pkgs.lib.meta.availableOn pkgs.stdenv.hostPlatform pkgs.discord;
      discordIntegrationChecks = pkgs.lib.optionalAttrs discordAvailable {
        discord-with-vencord = pkgs.callPackage ../../pkgs/discord {
          withVencord = true;
          inherit (packages) vencord;
        };
        discord-with-vencord-openasar = pkgs.callPackage ../../pkgs/discord {
          withVencord = true;
          withOpenASAR = true;
          inherit (packages) vencord openasar;
        };
        discord-with-equicord = pkgs.callPackage ../../pkgs/discord {
          withEquicord = true;
          inherit (packages) equicord;
        };
        discord-with-krisp = pkgs.callPackage ../../pkgs/discord {
          withKrisp = true;
        };
      };
      nonFlake = import ../.. { inherit pkgs; };
      nonFlakeNixos = import (pkgs.path + "/nixos/lib/eval-config.nix") {
        system = "x86_64-linux";
        modules = [ nonFlake.nixosModules.nixcord ];
      };
      nonFlakeInterface =
        assert nonFlake.packages.vencord.drvPath == packages.vencord.drvPath;
        assert nonFlake ? homeModules;
        assert nonFlake ? nixosModules;
        assert nonFlake ? darwinModules;
        assert !nonFlakeNixos.config.programs.nixcord.enable;
        pkgs.runCommandLocal "nixcord-non-flake-interface" { } "touch $out";
    in
    {
      checks =
        import ../../modules/tests {
          inherit pkgs;
          inherit (packages) openasar;
        }
        // discordIntegrationChecks
        // {
          non-flake-interface = nonFlakeInterface;
        };
    };
}
