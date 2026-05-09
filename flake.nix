{
  inputs = {
    flake-parts.url = "github:hercules-ci/flake-parts";
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
    nixpkgs-nixcord.url = "github:NixOS/nixpkgs/nixos-25.11";
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
        { system, inputs', ... }:
        let
          pkgs = import inputs.nixpkgs-nixcord {
            inherit system;
            config = {
              allowUnfree = true;
            };
          };
        in
        {
          _module.args.pkgs = pkgs;
          checks =
            let
              hm-eval = import ./modules/tests/hm-eval.nix { inherit pkgs; };
              nixos-eval = import ./modules/tests/nixos-eval.nix { inherit pkgs; };
              darwin-eval = import ./modules/tests/darwin-eval.nix { inherit pkgs; };
              config-output = import ./modules/tests/config-output.nix { inherit pkgs; };
              assertions = import ./modules/tests/assertions.nix { inherit pkgs; };
            in
            {
              inherit hm-eval nixos-eval config-output assertions;
            }
            // pkgs.lib.optionalAttrs pkgs.stdenv.hostPlatform.isDarwin {
              inherit darwin-eval;
            };

          packages = {
            discord = pkgs.callPackage ./pkgs/discord.nix { };
            discord-ptb = pkgs.callPackage ./pkgs/discord.nix { branch = "ptb"; };
            discord-canary = pkgs.callPackage ./pkgs/discord.nix { branch = "canary"; };
            discord-development = pkgs.callPackage ./pkgs/discord.nix { branch = "development"; };
            vencord = pkgs.callPackage ./pkgs/vencord.nix { };
            vencord-unstable = pkgs.callPackage ./pkgs/vencord.nix { unstable = true; };
            equicord = pkgs.callPackage ./pkgs/equicord.nix { };
            generate = pkgs.callPackage ./pkgs/generate-options.nix {
              vencord = pkgs.callPackage ./pkgs/vencord.nix { };
              equicord = pkgs.callPackage ./pkgs/equicord.nix { };
            };

            docs-html =
              (import ./docs {
                pkgs = pkgs;
                lib = pkgs.lib;
              }).html;
            docs-json =
              (import ./docs {
                pkgs = pkgs;
                lib = pkgs.lib;
              }).json;
          };

          apps.generate = {
            type = "app";
            program = pkgs.lib.getExe (
              pkgs.writeShellApplication {
                name = "generate-plugin-options";
                runtimeInputs = [
                  pkgs.git
                  pkgs.nixfmt-rfc-style
                ];
                text = ''
                  if [[ "''${NIXCORD_GENERATE_WITH_GIT:-0}" == "1" ]]; then
                    tmpdir=$(mktemp -d)
                    cleanup() { rm -rf "$tmpdir"; }
                    trap cleanup EXIT

                    clone_source() {
                      local package_file="$1"
                      local out_dir="$2"
                      local owner repo rev
                      owner=$(nix eval --impure --raw --expr "with import <nixpkgs> {}; (callPackage ./pkgs/$package_file {}).src.owner")
                      repo=$(nix eval --impure --raw --expr "with import <nixpkgs> {}; (callPackage ./pkgs/$package_file {}).src.repo")
                      rev=$(nix eval --impure --raw --expr "with import <nixpkgs> {}; (callPackage ./pkgs/$package_file {}).src.rev or (callPackage ./pkgs/$package_file {}).src.tag")

                      git clone --filter=blob:none --no-tags "https://github.com/$owner/$repo" "$out_dir"
                      git -C "$out_dir" fetch --depth=500 origin "$rev" || git -C "$out_dir" fetch --depth=500 origin "refs/tags/$rev"
                      git -C "$out_dir" checkout --detach FETCH_HEAD
                    }

                    vencord_dir="$tmpdir/vencord"
                    equicord_dir="$tmpdir/equicord"
                    clone_source vencord.nix "$vencord_dir"
                    clone_source equicord.nix "$equicord_dir"

                    nix build --impure --out-link ./result --expr "
                      let pkgs = import <nixpkgs> {};
                      in pkgs.callPackage ./pkgs/generate-options.nix {
                        vencord = pkgs.callPackage ./pkgs/vencord.nix {};
                        equicord = pkgs.callPackage ./pkgs/equicord.nix {};
                        vencordSource = $vencord_dir;
                        equicordSource = $equicord_dir;
                        skipGitMigrations = false;
                      }
                    "
                  else
                    nix build .#generate --out-link ./result
                  fi

                  mkdir -p ./modules/plugins
                  cp -R ./result/plugins/. ./modules/plugins/
                  cp ./result/deprecated.nix ./modules/plugins/ 2>/dev/null || true
                  chmod -R u+w ./modules/plugins
                  nixfmt ./modules/plugins/*.nix
                '';
              }
            );
          };
        };

      flake = {
        homeModules.default =
          { pkgs, ... }:
          {
            imports = [ ./modules/hm ];
            _module.args.nixcordPkgs = inputs.self.packages.${pkgs.stdenv.hostPlatform.system};
          };
        homeModules.nixcord = inputs.self.homeModules.default;

        nixosModules.default =
          { pkgs, ... }:
          {
            imports = [ ./modules/nixos ];
            _module.args.nixcordPkgs = inputs.self.packages.${pkgs.stdenv.hostPlatform.system};
          };
        nixosModules.nixcord = inputs.self.nixosModules.default;

        darwinModules.default =
          { pkgs, ... }:
          {
            imports = [ ./modules/darwin ];
            _module.args.nixcordPkgs = inputs.self.packages.${pkgs.stdenv.hostPlatform.system};
          };
        darwinModules.nixcord = inputs.self.darwinModules.default;
      };
    };
}
