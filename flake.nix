{
  inputs = {
    flake-parts.url = "github:hercules-ci/flake-parts";
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";
    nixpkgs-nixcord.url = "github:NixOS/nixpkgs/nixos-26.05";
    flake-compat.url = "https://flakehub.com/f/edolstra/flake-compat/1.tar.gz";
  };

  outputs =
    inputs:
    inputs.flake-parts.lib.mkFlake { inherit inputs; } {
      imports = [ ];
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
        "x86_64-darwin"
      ];
      perSystem =
        { system, ... }:
        let
          pkgs = import inputs.nixpkgs-nixcord {
            inherit system;
            config = {
              allowUnfree = true;
            };
          };
          revision =
            if builtins.hasAttr "rev" inputs.self && inputs.self.rev != null then
              inputs.self.rev
            else if builtins.hasAttr "dirtyRev" inputs.self && inputs.self.dirtyRev != null then
              inputs.self.dirtyRev
            else
              "main";
          discordAvailable = pkgs.lib.meta.availableOn pkgs.stdenv.hostPlatform pkgs.discord;
          discordVariants = {
            discord = { };
            discord-ptb.branch = "ptb";
            discord-canary.branch = "canary";
            discord-development.branch = "development";
          };
          discordPackages = pkgs.lib.optionalAttrs discordAvailable (
            pkgs.lib.mapAttrs (_name: args: pkgs.callPackage ./pkgs/discord args) discordVariants
          );
          vencord = pkgs.callPackage ./pkgs/vencord.nix { };
          equicord = pkgs.callPackage ./pkgs/equicord.nix { };
          discordIntegrationChecks = pkgs.lib.optionalAttrs discordAvailable {
            discord-with-vencord = pkgs.callPackage ./pkgs/discord {
              withVencord = true;
              inherit vencord;
            };
            discord-with-equicord = pkgs.callPackage ./pkgs/discord {
              withEquicord = true;
              inherit equicord;
            };
            discord-with-krisp = pkgs.callPackage ./pkgs/discord {
              withKrisp = true;
            };
          };
          docsArtifacts = import ./docs {
            inherit pkgs revision;
          };
          docsSystems = [
            "x86_64-linux"
            "aarch64-darwin"
          ];
          docsPackages = pkgs.lib.optionalAttrs (builtins.elem system docsSystems) {
            docs = docsArtifacts.html;
          };
        in
        {
          _module.args.pkgs = pkgs;
          checks = import ./modules/tests { inherit pkgs; } // discordIntegrationChecks;

          packages =
            discordPackages
            // docsPackages
            // {
              inherit vencord equicord;
              generate = pkgs.callPackage ./pkgs/generate-options.nix { };

              docs-json = docsArtifacts.json;
            };

          apps.generate = {
            type = "app";
            program = pkgs.lib.getExe (
              pkgs.writeShellApplication {
                name = "generate-plugin-options";
                runtimeInputs = [
                  pkgs.nix
                  pkgs.nixfmt
                ];
                text = ''
                  generated=$(nix build .#generate --no-link --print-out-paths)
                  mkdir -p ./modules/plugins
                  cp -R "$generated/plugins/." ./modules/plugins/
                  chmod -R u+w ./modules/plugins
                  nixfmt ./modules/plugins/*.nix
                '';
              }
            );
            meta.description = "Regenerate nixcord plugin option files";
          };
        };

      flake =
        let
          mkNixcordModule =
            {
              class,
              module,
              output,
            }:
            { pkgs, ... }:
            let
              location = "${inputs.self.outPath}/flake.nix#${output}";
            in
            {
              _class = class;
              _file = location;
              key = location;
              imports = [ module ];
              _module.args.nixcordPkgs = inputs.self.packages.${pkgs.stdenv.hostPlatform.system};
            };
        in
        {
          homeModules.default = mkNixcordModule {
            class = "homeManager";
            module = ./modules/hm;
            output = "homeModules.default";
          };
          homeModules.nixcord = inputs.self.homeModules.default;

          nixosModules.default = mkNixcordModule {
            class = "nixos";
            module = ./modules/nixos;
            output = "nixosModules.default";
          };
          nixosModules.nixcord = inputs.self.nixosModules.default;

          darwinModules.default = mkNixcordModule {
            class = "darwin";
            module = ./modules/darwin;
            output = "darwinModules.default";
          };
          darwinModules.nixcord = inputs.self.darwinModules.default;
        };
    };
}
