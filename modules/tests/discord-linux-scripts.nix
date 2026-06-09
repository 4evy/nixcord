{ pkgs }:

pkgs.runCommand "discord-linux-scripts-check"
  {
    nativeBuildInputs = [
      pkgs.jq
      pkgs.makeWrapper
    ];
  }
  ''
    wrapper_dir="$TMPDIR/wrapper"
    mkdir -p "$wrapper_dir"
    target="$wrapper_dir/discord"
    stage_script="$wrapper_dir/stage-modules"
    deploy_script="$wrapper_dir/deploy-krisp"
    wrapper_log="$wrapper_dir/run.log"

    cat > "$target" <<'EOF'
    #!${pkgs.runtimeShell}
    exit 0
    EOF
    chmod +x "$target"

    cat > "$stage_script" <<EOF
    #!${pkgs.runtimeShell}
    printf 'stage %s\n' "\$*" >> "$wrapper_log"
    EOF
    chmod +x "$stage_script"

    cat > "$deploy_script" <<EOF
    #!${pkgs.runtimeShell}
    printf 'deploy\n' >> "$wrapper_log"
    EOF
    chmod +x "$deploy_script"

    source ${../../pkgs/discord/scripts/wrap-linux-discord.sh} \
      "$target" \
      "$stage_script" \
      /store/modules \
      "$deploy_script" \
      1 \
      ""

    "$target"

    diff -u \
      <(printf 'stage /store/modules\ndeploy\n') \
      "$wrapper_log"

    export HOME="$TMPDIR/home"
    export XDG_CONFIG_HOME="$HOME/.config"
    export DISCORD_STAGE_PLATFORM=linux
    export DISCORD_CONFIG_DIR_NAME=discord
    export DISCORD_VERSION=1.0.141
    export DISCORD_STAGED_MODULES="discord_desktop_core discord_krisp discord_voice"
    export DISCORD_DISABLED_UPDATE_SETTINGS_JSON='{"SKIP_HOST_UPDATE":true,"SKIP_MODULE_UPDATE":true,"USE_NEW_UPDATER":false}'
    export DISCORD_INSTALLED_MODULES_JSON='{"discord_desktop_core":{"installedVersion":1},"discord_krisp":{"installedVersion":1},"discord_voice":{"installedVersion":1}}'

    store="$TMPDIR/store-modules"
    mkdir -p "$store/discord_desktop_core" "$store/discord_krisp" "$store/discord_voice"
    printf 'desktop\n' > "$store/discord_desktop_core/index.js"
    printf 'store krisp\n' > "$store/discord_krisp/index.js"
    printf 'voice\n' > "$store/discord_voice/index.js"

    user_modules="$XDG_CONFIG_HOME/discord/$DISCORD_VERSION/modules"
    mkdir -p "$user_modules/discord_krisp"
    printf 'deployed krisp\n' > "$user_modules/discord_krisp/index.js"
    printf 'hash\n' > "$user_modules/discord_krisp/.nix-krisp-hash"

    bash ${../../pkgs/discord/scripts/stage-modules.sh} "$store"

    test -L "$user_modules/discord_desktop_core"
    test "$(readlink "$user_modules/discord_desktop_core")" = "$store/discord_desktop_core"
    test -L "$user_modules/discord_voice"
    test "$(readlink "$user_modules/discord_voice")" = "$store/discord_voice"

    test ! -L "$user_modules/discord_krisp"
    grep -Fx 'deployed krisp' "$user_modules/discord_krisp/index.js"
    grep -Fx 'hash' "$user_modules/discord_krisp/.nix-krisp-hash"
    jq -e '.discord_krisp.installedVersion == 1' "$user_modules/installed.json"

    touch "$out"
  ''
