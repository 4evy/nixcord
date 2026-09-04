{
  perSystem =
    {
      config,
      pkgs,
      ...
    }:
    {
      apps.generate = {
        type = "app";
        program = pkgs.lib.meta.getExe (
          pkgs.writeShellApplication {
            name = "generate-plugin-options";
            runtimeInputs = [
              pkgs.git
              pkgs.nix
              pkgs.nixfmt
            ];
            text = ''
              if [[ "''${NIXCORD_GENERATE_WITH_GIT:-0}" == "1" ]]; then
                generate_tmp=$(mktemp -d)
                cleanup() {
                  rm -rf -- "$generate_tmp"
                }
                trap cleanup EXIT

                clone_source() {
                  local owner="$1"
                  local repo="$2"
                  local rev="$3"
                  local destination="$4"

                  git init --quiet "$destination"
                  git -C "$destination" remote add origin "https://github.com/$owner/$repo"
                  git -C "$destination" fetch --no-tags --shallow-since="60 days ago" origin "$rev"
                  git -C "$destination" checkout --detach FETCH_HEAD
                }

                vencord_dir="$generate_tmp/vencord"
                equicord_dir="$generate_tmp/equicord"
                clone_source \
                  ${pkgs.lib.strings.escapeShellArg config.packages.vencord.src.owner} \
                  ${pkgs.lib.strings.escapeShellArg config.packages.vencord.src.repo} \
                  ${pkgs.lib.strings.escapeShellArg config.packages.vencord.src.rev} \
                  "$vencord_dir"
                clone_source \
                  ${pkgs.lib.strings.escapeShellArg config.packages.equicord.src.owner} \
                  ${pkgs.lib.strings.escapeShellArg config.packages.equicord.src.repo} \
                  ${pkgs.lib.strings.escapeShellArg config.packages.equicord.src.rev} \
                  "$equicord_dir"

                generated=$(nix build --impure --no-link --print-out-paths --expr "
                  let
                    flake = builtins.getFlake (toString ./.);
                    pkgs = import flake.inputs.nixpkgs-nixcord {
                      system = \"${pkgs.stdenv.hostPlatform.system}\";
                      config.allowUnfree = true;
                    };
                  in
                  pkgs.callPackage ./pkgs/generate-options.nix {
                    vencordSource = $vencord_dir;
                    equicordSource = $equicord_dir;
                    skipGitMigrations = false;
                  }
                ")
              else
                generated=$(nix build .#generate --no-link --print-out-paths)
              fi

              mkdir -p ./modules/plugins
              cp -R "$generated/plugins/." ./modules/plugins/
              chmod -R u+w ./modules/plugins
              nixfmt ./modules/plugins/*.nix
            '';
          }
        );
        meta.description = "Regenerate nixcord plugin option files";
      };

      apps.update-goofcord = {
        type = "app";
        program = pkgs.lib.meta.getExe config.packages.goofcord.passthru.updateScript;
        meta.description = "Refresh GoofCord's aarch64-darwin dependency snapshot";
      };
    };
}
