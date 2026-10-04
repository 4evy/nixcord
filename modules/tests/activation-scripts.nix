{ pkgs }:

let
  inherit (pkgs) lib;
  testRoot = "/tmp/nixcord-activation-scripts-test";
  cfg = {
    user = "testuser";
    homeDirectory =
      if pkgs.stdenvNoCC.hostPlatform.isDarwin then "/Users/testuser" else "/home/testuser";
    xdgConfigHome =
      if pkgs.stdenvNoCC.hostPlatform.isDarwin then
        "/Users/testuser/.config"
      else
        "/home/testuser/.config";
    configDir = "${testRoot}/Vencord";
    discord = {
      branches = [
        "stable"
        "ptb"
        "canary"
      ];
      configDir = "${testRoot}/discord";
    };
    config.regressionValue = "base";
    extraConfig = {
      regressionValue = "override";
      extraValue = true;
      quotedValue = "it's preserved";
    };
  };
  expectedVencordSettings = builtins.toJSON {
    extraValue = true;
    quotedValue = "it's preserved";
    regressionValue = "override";
  };
  scripts = import ../lib/activation.nix {
    inherit lib pkgs cfg;
    mkVencordCfg = lib.trivial.id;
    wrapScript = lib.trivial.id;
  };
  install = lib.meta.getExe' pkgs.coreutils "install";
  discordConfigBase =
    if pkgs.stdenvNoCC.hostPlatform.isDarwin then
      "/Users/testuser/Library/Application Support"
    else
      "/home/testuser/.config";
  dorionStorage =
    if pkgs.stdenvNoCC.hostPlatform.isDarwin then
      "/Users/testuser/Library/WebKit/com.spikehd.dorion/WebsiteData/Default"
    else
      "/home/testuser/.local/share/dorion/profiles/default/webdata/localstorage";
  disableDiscordUpdates =
    lib.strings.replaceString install (lib.meta.getExe' pkgs.coreutils "true")
      scripts.disableDiscordUpdates;
  fixDiscordModules =
    lib.strings.replaceString discordConfigBase "${testRoot}/discord-configs"
      scripts.fixDiscordModules;
  setupDorionVencordSettings =
    lib.strings.replaceString dorionStorage "${testRoot}/dorion-storage"
      scripts.setupDorionVencordSettings;
  sqlite = lib.meta.getExe pkgs.sqlite;
in
pkgs.runCommand "activation-scripts-test"
  {
    nativeBuildInputs = [ pkgs.jq ];
  }
  ''
    rm -rf ${lib.strings.escapeShellArg testRoot}
    mkdir -p ${lib.strings.escapeShellArg "${testRoot}/discord"} ${lib.strings.escapeShellArg "${testRoot}/discordptb"} ${lib.strings.escapeShellArg "${testRoot}/discordcanary"} ${lib.strings.escapeShellArg "${testRoot}/Vencord"}
    printf '%s\n' '{"KEEP":true,"USE_NEW_UPDATER":true}' > ${lib.strings.escapeShellArg "${testRoot}/discord/settings.json"}
    printf '%s\n' '{"PTB":true}' > ${lib.strings.escapeShellArg "${testRoot}/discordptb/settings.json"}

    ${disableDiscordUpdates}

    jq -e '
      .KEEP == true
      and .SKIP_HOST_UPDATE == true
      and .SKIP_MODULE_UPDATE == true
      and .USE_NEW_UPDATER == false
    ' ${lib.strings.escapeShellArg "${testRoot}/discord/settings.json"}

    jq -e '
      .PTB == true
      and .SKIP_HOST_UPDATE == true
      and .SKIP_MODULE_UPDATE == true
      and .USE_NEW_UPDATER == false
    ' ${lib.strings.escapeShellArg "${testRoot}/discordptb/settings.json"}

    jq -e '
      .SKIP_HOST_UPDATE == true
      and .SKIP_MODULE_UPDATE == true
      and .USE_NEW_UPDATER == false
      and length == 3
    ' ${lib.strings.escapeShellArg "${testRoot}/discordcanary/settings.json"}

    rm ${lib.strings.escapeShellArg "${testRoot}/discord/settings.json"}
    ${disableDiscordUpdates}
    jq -e '
      .SKIP_HOST_UPDATE == true
      and .SKIP_MODULE_UPDATE == true
      and .USE_NEW_UPDATER == false
      and length == 3
    ' ${lib.strings.escapeShellArg "${testRoot}/discord/settings.json"}

    previous=${lib.strings.escapeShellArg "${testRoot}/discord-configs/discord/1.0.0/modules"}
    current=${lib.strings.escapeShellArg "${testRoot}/discord-configs/discord/2.0.0/modules"}
    mkdir -p "$previous" "$current/pending"
    printf 'previous\n' > "$previous/discord_desktop_core"
    original_pwd="$PWD"

    ${fixDiscordModules}

    test "$PWD" = "$original_pwd"
    grep -Fx previous "$current/discord_desktop_core"
    test ! -e "$current/pending"

    ptb_previous=${lib.strings.escapeShellArg "${testRoot}/discord-configs/discordptb/1.0.0/modules"}
    ptb_current=${lib.strings.escapeShellArg "${testRoot}/discord-configs/discordptb/2.0.0/modules"}
    mkdir -p "$ptb_previous" "$ptb_current/pending"
    printf 'previous ptb\n' > "$ptb_previous/discord_desktop_core"
    ${fixDiscordModules}
    grep -Fx 'previous ptb' "$ptb_current/discord_desktop_core"

    printf 'current\n' > "$current/discord_desktop_core"
    printf 'changed previous\n' > "$previous/discord_desktop_core"
    ${fixDiscordModules}
    grep -Fx current "$current/discord_desktop_core"

    mkdir -p ${lib.strings.escapeShellArg "${testRoot}/dorion-storage"}
    dorion_db=${lib.strings.escapeShellArg "${testRoot}/dorion-storage/settings.sqlite3"}
    unrelated_db=${lib.strings.escapeShellArg "${testRoot}/dorion-storage/unrelated.sqlite3"}
    ${sqlite} "$dorion_db" \
      "CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value BLOB); INSERT INTO ItemTable VALUES ('VencordSettings', X'00');"
    ${sqlite} "$unrelated_db" \
      "CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value BLOB);"

    ${setupDorionVencordSettings}

    expected_hex=$(printf '%s' ${lib.strings.escapeShellArg expectedVencordSettings} \
      | ${lib.meta.getExe' pkgs.iconv "iconv"} -f UTF-8 -t UTF-16LE \
      | ${lib.meta.getExe pkgs.xxd} -p | tr -d '\n' | tr '[:lower:]' '[:upper:]')
    actual_hex=$(${sqlite} "$dorion_db" \
      "SELECT hex(value) FROM ItemTable WHERE key = 'VencordSettings';")
    test "$actual_hex" = "$expected_hex"
    test "$(${sqlite} "$unrelated_db" 'SELECT COUNT(*) FROM ItemTable;')" -eq 0

    rm -rf ${lib.strings.escapeShellArg testRoot}
    touch "$out"
  ''
