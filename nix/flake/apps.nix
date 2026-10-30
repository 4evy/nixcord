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
  updatePackages = builtins.filter (name: builtins.hasAttr name packages) [
    "discord-patch-tools"
    "discord"
    "discord-ptb"
    "discord-canary"
    "discord-development"
    "equicord"
    "vencord"
    "goofcord"
    "generate"
  ];
  updateFiles =
    lib.genAttrs [
      "discord"
      "discord-ptb"
      "discord-canary"
      "discord-development"
    ] (_: "pkgs/discord/sources/sources.json")
    // {
      discord-patch-tools = "pkgs/discord/patching/default.nix";
      generate = "pkgs/generate-options/node-modules.nix";
    };
  update = pkgs.writeShellApplication {
    name = "update";
    runtimeInputs = [
      pkgs.nix-update
      pkgs.nix
      (pkgs.callPackage ../bun/bun.nix { })
    ];
    # nix-update 1.16 resolves <nixpkgs> when running flake update hooks
    runtimeEnv.NIX_PATH = "nixpkgs=${pkgs.path}";
    text = ''
      if [[ "''${1:-}" == --help ]]; then
        echo 'Usage: nix run .#update -- [PACKAGE ...]'
        echo 'With no arguments, update all local package pins and dependency hashes'
        echo 'Targets: ${lib.concatStringsSep " " updatePackages}'
        echo 'OpenASAR follows the nixpkgs-packages flake input'
        exit 0
      fi
      if [[ $# -eq 0 ]]; then
        set -- ${lib.escapeShellArgs updatePackages}
      fi
      for package in "$@"; do
        case "$package" in
          ${lib.concatStringsSep "|" updatePackages}) ;;
          *) echo "Unknown update target: $package" >&2; exit 1 ;;
        esac
      done
      for package in "$@"; do
        case "$package" in
          ${lib.concatMapStringsSep "\n" (name: ''
            ${lib.escapeShellArg name})
              nix-update --flake --use-update-script ${
                lib.escapeShellArgs [
                  "--override-filename=${updateFiles.${name} or "pkgs/${name}/default.nix"}"
                  name
                ]
              }
              ${lib.optionalString (lib.elem name pluginPackages) ''
                dependency=$(nix eval --raw ${lib.escapeShellArg ".#${name}.src.urls"} --apply builtins.head)
                source=$(nix build --no-link --print-out-paths ${lib.escapeShellArg ".#${name}.src"})
                bun ${../../pkgs/build-client-mod/prepare-package.ts} "$source" package.json
                bun add --dev --lockfile-only --ignore-scripts "${name}@$dependency"
                bun ${../../pkgs/build-client-mod/normalize-lockfile.ts} ${lib.escapeShellArg name}
                bun install --lockfile-only --ignore-scripts --save-text-lockfile
              ''}
              ;;
          '') updatePackages}
        esac
      done
    '';
  };
  updateApp =
    names:
    mkApp (
      pkgs.writeShellApplication {
        name = "update-${lib.concatStringsSep "-" names}";
        text = ''
          exec ${lib.getExe update} ${lib.escapeShellArgs names} "$@"
        '';
      }
    );
in
{
  apps.update = (mkApp update) // {
    meta.description = "Update all local package pins, or selected package names, with nix-update";
  };
  apps.update-plugins = updateApp pluginPackages;
  apps.update-discord = updateApp (builtins.filter (lib.hasPrefix "discord") updatePackages);

  apps.generate =
    (mkApp (
      pkgs.writeShellApplication {
        name = "generate-plugin-options";
        runtimeInputs = [
          pkgs.coreutils
          pkgs.git
          pkgs.nix
          pkgs.nixfmt
        ];
        text = ''
          if [[ "''${GENERATE_WITH_GIT:-0}" == "1" ]]; then
            generate_tmp=$(mktemp --directory)
            cleanup() {
              rm --recursive --force -- "$generate_tmp"
            }
            trap cleanup EXIT

            ${lib.concatMapStringsSep "\n" (
              name:
              let
                src = packages.${name}.src;
              in
              ''
                git init --quiet "$generate_tmp/${name}"
                git -C "$generate_tmp/${name}" remote add origin ${lib.escapeShellArg "https://github.com/${src.owner}/${src.repo}"}
                git -C "$generate_tmp/${name}" fetch --no-tags --shallow-since="60 days ago" origin ${lib.escapeShellArg src.rev}
                git -C "$generate_tmp/${name}" checkout --detach FETCH_HEAD
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

          mkdir --parents ./modules/plugins
          cp --recursive "$generated/plugins/." ./modules/plugins/
          chmod --recursive u+w ./modules/plugins
          nixfmt ./modules/plugins/*.nix ./modules/plugins/{options,schema}/*.nix
        '';
      }
    ))
    // {
      meta.description = "Regenerate plugin option files";
    };

  apps.update-goofcord = (updateApp [ "goofcord" ]) // {
    meta.description = "Refresh GoofCord's Bun dependency cache";
  };
}
