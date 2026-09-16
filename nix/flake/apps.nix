{ pkgs, packages }:
let
  inherit (pkgs) lib;
  pluginPackages = [
    "equicord"
    "vencord"
  ];
  mkApp = package: {
    type = "app";
    program = lib.getExe package;
  };
in
{
  apps.update-plugins = mkApp (
    pkgs.writeShellApplication {
      name = "update-plugins";
      runtimeInputs = [
        pkgs.jq
        pkgs.nix-update
        pkgs.nix
        (pkgs.callPackage ../nodejs.nix { })
      ];
      text = ''
        ${lib.concatMapStringsSep "\n" (
          name: lib.escapeShellArgs packages.${name}.updateScript
        ) pluginPackages}
        for package in ${lib.escapeShellArgs pluginPackages}; do
          dependency=$(nix eval --json ".#$package.src.urls" | \
            jq -er 'first')
          npm install --save-dev --package-lock-only --ignore-scripts "$package@$dependency"
        done
      '';
    }
  );

  apps.generate =
    (mkApp (
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

            ${lib.concatMapStringsSep "\n" (
              name:
              let
                src = packages.${name}.src;
              in
              ''
                clone_source ${
                  lib.escapeShellArgs [
                    src.owner
                    src.repo
                    src.rev
                  ]
                } "$generate_tmp/${name}"
              ''
            ) pluginPackages}

            generated=$(nix build --impure --no-link --print-out-paths \
              --file ${../generate-with-git.nix} \
              --argstr root "$PWD" \
              --argstr system ${lib.escapeShellArg pkgs.stdenv.hostPlatform.system} \
              --argstr vencordSource "$generate_tmp/vencord" \
              --argstr equicordSource "$generate_tmp/equicord")
          else
            generated=$(nix build .#generate --no-link --print-out-paths)
          fi

          mkdir -p ./modules/plugins
          cp -R "$generated/plugins/." ./modules/plugins/
          chmod -R u+w ./modules/plugins
          nixfmt ./modules/plugins/*.nix
        '';
      }
    ))
    // {
      meta.description = "Regenerate nixcord plugin option files";
    };

  apps.update-goofcord = (mkApp packages.goofcord.passthru.updateScript) // {
    meta.description = "Refresh GoofCord's npm dependency cache";
  };
}
