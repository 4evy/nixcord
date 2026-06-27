{ pkgs }:

pkgs.runCommand "discord-linux-scripts-check"
  {
    nativeBuildInputs = [
      pkgs.jq
      pkgs.makeWrapper
    ];
  }
  ''
    set -euo pipefail

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
    config_home="$PWD/config-home"
    export XDG_CONFIG_HOME="$config_home"
    export DISCORD_STAGE_PLATFORM=linux
    export DISCORD_CONFIG_DIR_NAME=discord
    export DISCORD_VERSION=1.0.0
    export DISCORD_STAGED_MODULES="discord_desktop_core discord_krisp discord_voice"
    export DISCORD_DISABLED_UPDATE_SETTINGS_JSON='{"SKIP_HOST_UPDATE":true,"SKIP_MODULE_UPDATE":true,"USE_NEW_UPDATER":false}'
    export DISCORD_INSTALLED_MODULES_JSON='{"discord_desktop_core":{"installedVersion":1},"discord_krisp":{"installedVersion":1},"discord_voice":{"installedVersion":1}}'

    mkdir -p "$store/discord_desktop_core" "$store/discord_krisp" "$store/discord_voice"
    printf 'store core\n' > "$store/discord_desktop_core/index.js"
    printf 'store krisp\n' > "$store/discord_krisp/index.js"
    printf 'store voice\n' > "$store/discord_voice/index.js"

    user_modules="$config_home/discord/1.0.0/modules"
    mkdir -p "$user_modules/discord_old" "$user_modules/discord_krisp"
    printf 'old\n' > "$user_modules/discord_old/index.js"
    printf 'deployed krisp\n' > "$user_modules/discord_krisp/index.js"
    printf 'hash\n' > "$user_modules/discord_krisp/.nix-krisp-hash"
    printf '{"KEEP":true}\n' > "$config_home/discord/settings.json"

    bash ${../../pkgs/discord/scripts/stage-modules.sh} "$store"

    test -L "$user_modules/discord_desktop_core"
    test "$(readlink "$user_modules/discord_desktop_core")" = "$store/discord_desktop_core"
    test -L "$user_modules/discord_voice"
    test "$(readlink "$user_modules/discord_voice")" = "$store/discord_voice"
    test ! -e "$user_modules/discord_old"
    test ! -L "$user_modules/discord_krisp"
    grep -Fx 'deployed krisp' "$user_modules/discord_krisp/index.js"
    grep -Fx 'hash' "$user_modules/discord_krisp/.nix-krisp-hash"
    jq -e '.discord_krisp.installedVersion == 1' "$user_modules/installed.json"
    jq -e '.KEEP == true and .SKIP_HOST_UPDATE == true and .SKIP_MODULE_UPDATE == true and .USE_NEW_UPDATER == false' "$config_home/discord/settings.json"

    touch "$out"
  ''
