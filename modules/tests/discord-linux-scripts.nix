{ pkgs }:

let
  discordAvailable = pkgs.lib.meta.availableOn pkgs.stdenv.hostPlatform pkgs.discord;
  nixcordDiscord = if discordAvailable then pkgs.callPackage ../../pkgs/discord { } else null;
in

pkgs.runCommand "discord-linux-scripts-check"
  {
    nativeBuildInputs = [
      pkgs.jq
      pkgs.makeWrapper
    ];
  }
  ''
    set -euo pipefail

    ${pkgs.lib.strings.optionalString discordAvailable ''
      # The non-FHS nixpkgs launcher runs nixcord's staging helper so the Krisp
      # deployer keeps ownership of its writable module.
      test -x ${nixcordDiscord.stageModules}
      test ! -d ${nixcordDiscord.stageModules}
      grep -F -- ${pkgs.lib.strings.escapeShellArg "${nixcordDiscord.stageModules} ${nixcordDiscord}/opt/Discord/modules"} \
        ${nixcordDiscord}/opt/Discord/Discord
    ''}

    wrapper_dir="$PWD/wrapper"
    mkdir -p "$wrapper_dir/bin"
    deploy_script="$wrapper_dir/deploy-krisp"
    printf '#!%s\ntouch "$DEPLOY_MARKER"\n' "${pkgs.runtimeShell}" > "$deploy_script"
    chmod +x "$deploy_script"

    target="$PWD/Discord-target"
    cat > "$target" <<'EOF'
    #!${pkgs.runtimeShell}
    printf '%s\n' "$@" > "$TARGET_ARGS_FILE"
    EOF
    chmod +x "$target"

    launcher="$PWD/Discord"
    cp "$target" "$launcher"
    makeWrapper "$launcher" "$PWD/bin-discord" \
      --run "$deploy_script" \
      --add-flags "--flag-one --flag-two"

    export DEPLOY_MARKER="$PWD/deployed"
    export TARGET_ARGS_FILE="$PWD/args"
    "$PWD/bin-discord" --from-user
    test -f "$DEPLOY_MARKER"
    grep -Fx -- "--from-user" "$TARGET_ARGS_FILE"
    grep -Fx -- "--flag-one" "$TARGET_ARGS_FILE"
    grep -Fx -- "--flag-two" "$TARGET_ARGS_FILE"

    store="$PWD/store-modules"
    export DISCORD_CONFIG_DIR_NAME=discord
    export DISCORD_VERSION=1.0.0
    export DISCORD_STAGED_MODULES="discord_desktop_core discord_krisp discord_voice"
    export DISCORD_DISABLED_UPDATE_SETTINGS_JSON='{"SKIP_HOST_UPDATE":true,"SKIP_MODULE_UPDATE":true,"USE_NEW_UPDATER":false}'
    export DISCORD_INSTALLED_MODULES_JSON='{"discord_desktop_core":{"installedVersion":1},"discord_krisp":{"installedVersion":1},"discord_voice":{"installedVersion":1}}'

    mkdir -p "$store/discord_desktop_core" "$store/discord_krisp" "$store/discord_voice"
    printf 'store core\n' > "$store/discord_desktop_core/index.js"
    printf 'store krisp\n' > "$store/discord_krisp/index.js"
    printf 'store voice\n' > "$store/discord_voice/index.js"

    export DISCORD_STAGE_PLATFORM=linux
    export DISCORD_USER_DATA_DIR="$PWD/linux-user-data"
    linux_config="$DISCORD_USER_DATA_DIR/discord"
    linux_modules="$linux_config/1.0.0/modules"
    mkdir -p "$linux_modules/discord_old" "$linux_modules/discord_krisp"
    printf 'old\n' > "$linux_modules/discord_old/index.js"
    printf 'writable krisp\n' > "$linux_modules/discord_krisp/module.node"
    printf 'hash\n' > "$linux_modules/discord_krisp/.nix-krisp-hash"
    printf '{"KEEP":true}\n' > "$linux_config/settings.json"

    bash ${../../pkgs/discord/scripts/stage-modules.sh} "$store"

    for module in discord_desktop_core discord_voice; do
      test -L "$linux_modules/$module"
      test "$(readlink "$linux_modules/$module")" = "$store/$module"
    done
    test ! -e "$linux_modules/discord_old"
    test ! -L "$linux_modules/discord_krisp"
    grep -Fx 'writable krisp' "$linux_modules/discord_krisp/module.node"
    grep -Fx 'hash' "$linux_modules/discord_krisp/.nix-krisp-hash"
    jq -e '.discord_voice.installedVersion == 1 and .discord_krisp.installedVersion == 1' \
      "$linux_modules/installed.json"
    jq -e '.KEEP == true and .SKIP_HOST_UPDATE == true and .SKIP_MODULE_UPDATE == true and .USE_NEW_UPDATER == false' \
      "$linux_config/settings.json"
    test ! -e "$linux_config/module_data"

    export DISCORD_STAGE_PLATFORM=darwin
    export DISCORD_USER_DATA_DIR="$PWD/darwin-user-data"
    darwin_config="$DISCORD_USER_DATA_DIR/discord"
    darwin_modules="$darwin_config/1.0.0/modules"
    darwin_module_data="$darwin_config/module_data"
    mkdir -p \
      "$darwin_modules/discord_old" \
      "$darwin_modules/discord_krisp" \
      "$darwin_module_data/discord_old" \
      "$darwin_module_data/discord_krisp"
    printf 'writable krisp\n' > "$darwin_modules/discord_krisp/module.node"
    printf 'writable krisp data\n' > "$darwin_module_data/discord_krisp/module.node"
    printf '{"KEEP":true}\n' > "$darwin_config/settings.json"

    bash ${../../pkgs/discord/scripts/stage-modules.sh} "$store"

    for module in discord_desktop_core discord_voice; do
      test -L "$darwin_modules/$module"
      test "$(readlink "$darwin_modules/$module")" = "$store/$module"
      test -L "$darwin_module_data/$module"
      test "$(readlink "$darwin_module_data/$module")" = "$store/$module"
    done
    test ! -e "$darwin_modules/discord_old"
    test ! -e "$darwin_module_data/discord_old"
    test ! -L "$darwin_modules/discord_krisp"
    test ! -L "$darwin_module_data/discord_krisp"
    grep -Fx 'writable krisp' "$darwin_modules/discord_krisp/module.node"
    grep -Fx 'writable krisp data' "$darwin_module_data/discord_krisp/module.node"
    jq -e '.discord_voice.installedVersion == 1' "$darwin_modules/installed.json"
    jq -e '.KEEP == true and .SKIP_HOST_UPDATE == true and .SKIP_MODULE_UPDATE == true and .USE_NEW_UPDATER == false' \
      "$darwin_config/settings.json"

    touch "$out"
  ''
