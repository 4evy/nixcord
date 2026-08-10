{ pkgs }:

let
  inherit (pkgs) lib;
  testRoot = "/tmp/nixcord-activation-scripts-test";
  cfg = {
    user = "testuser";
    homeDirectory = if pkgs.stdenvNoCC.isDarwin then "/Users/testuser" else "/home/testuser";
    xdgConfigHome =
      if pkgs.stdenvNoCC.isDarwin then "/Users/testuser/.config" else "/home/testuser/.config";
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
    mkVencordCfg = lib.id;
    wrapScript = lib.id;
  };
  install = lib.getExe' pkgs.coreutils "install";
  discordConfigBase =
    if pkgs.stdenvNoCC.isDarwin then
      "/Users/testuser/Library/Application Support"
    else
      "/home/testuser/.config";
  dorionStorage =
    if pkgs.stdenvNoCC.isDarwin then
      "/Users/testuser/Library/WebKit/com.spikehd.dorion/WebsiteData/Default"
    else
      "/home/testuser/.local/share/dorion/profiles/default/webdata/localstorage";
  disableDiscordUpdates =
    builtins.replaceStrings [ install ] [ (lib.getExe' pkgs.coreutils "true") ]
      scripts.disableDiscordUpdates;
  fixDiscordModules =
    builtins.replaceStrings [ discordConfigBase ] [ "${testRoot}/discord-configs" ]
      scripts.fixDiscordModules;
  setupDorionVencordSettings =
    builtins.replaceStrings [ dorionStorage ] [ "${testRoot}/dorion-storage" ]
      scripts.setupDorionVencordSettings;
  sqlite = lib.getExe pkgs.sqlite;
in
pkgs.runCommand "activation-scripts-test"
  {
    nativeBuildInputs = [ pkgs.jq ];
  }
  ''
    rm -rf ${lib.escapeShellArg testRoot}
    mkdir -p ${lib.escapeShellArg "${testRoot}/discord"} ${lib.escapeShellArg "${testRoot}/discordptb"} ${lib.escapeShellArg "${testRoot}/discordcanary"} ${lib.escapeShellArg "${testRoot}/Vencord"}
    printf '%s\n' '{"KEEP":true,"USE_NEW_UPDATER":true}' > ${lib.escapeShellArg "${testRoot}/discord/settings.json"}
    printf '%s\n' '{"PTB":true}' > ${lib.escapeShellArg "${testRoot}/discordptb/settings.json"}

    ${disableDiscordUpdates}

    jq -e '
      .KEEP == true
      and .SKIP_HOST_UPDATE == true
      and .SKIP_MODULE_UPDATE == true
      and .USE_NEW_UPDATER == false
    ' ${lib.escapeShellArg "${testRoot}/discord/settings.json"}

    jq -e '
      .PTB == true
      and .SKIP_HOST_UPDATE == true
      and .SKIP_MODULE_UPDATE == true
      and .USE_NEW_UPDATER == false
    ' ${lib.escapeShellArg "${testRoot}/discordptb/settings.json"}

    jq -e '
      .SKIP_HOST_UPDATE == true
      and .SKIP_MODULE_UPDATE == true
      and .USE_NEW_UPDATER == false
      and length == 3
    ' ${lib.escapeShellArg "${testRoot}/discordcanary/settings.json"}

    rm ${lib.escapeShellArg "${testRoot}/discord/settings.json"}
    ${disableDiscordUpdates}
    jq -e '
      .SKIP_HOST_UPDATE == true
      and .SKIP_MODULE_UPDATE == true
      and .USE_NEW_UPDATER == false
      and length == 3
    ' ${lib.escapeShellArg "${testRoot}/discord/settings.json"}

    previous=${lib.escapeShellArg "${testRoot}/discord-configs/discord/1.0.0/modules"}
    current=${lib.escapeShellArg "${testRoot}/discord-configs/discord/2.0.0/modules"}
    mkdir -p "$previous" "$current/pending"
    printf 'previous\n' > "$previous/discord_desktop_core"
    original_pwd="$PWD"

    ${fixDiscordModules}

    test "$PWD" = "$original_pwd"
    grep -Fx previous "$current/discord_desktop_core"
    test ! -e "$current/pending"

    ptb_previous=${lib.escapeShellArg "${testRoot}/discord-configs/discordptb/1.0.0/modules"}
    ptb_current=${lib.escapeShellArg "${testRoot}/discord-configs/discordptb/2.0.0/modules"}
    mkdir -p "$ptb_previous" "$ptb_current/pending"
    printf 'previous ptb\n' > "$ptb_previous/discord_desktop_core"
    ${fixDiscordModules}
    grep -Fx 'previous ptb' "$ptb_current/discord_desktop_core"

    printf 'current\n' > "$current/discord_desktop_core"
    printf 'changed previous\n' > "$previous/discord_desktop_core"
    ${fixDiscordModules}
    grep -Fx current "$current/discord_desktop_core"

    mkdir -p ${lib.escapeShellArg "${testRoot}/dorion-storage"}
    dorion_db=${lib.escapeShellArg "${testRoot}/dorion-storage/settings.sqlite3"}
    unrelated_db=${lib.escapeShellArg "${testRoot}/dorion-storage/unrelated.sqlite3"}
    ${sqlite} "$dorion_db" \
      "CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value BLOB); INSERT INTO ItemTable VALUES ('VencordSettings', X'00');"
    ${sqlite} "$unrelated_db" \
      "CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value BLOB);"

    ${setupDorionVencordSettings}

    expected_hex=$(printf '%s' ${lib.escapeShellArg expectedVencordSettings} \
      | ${lib.getExe' pkgs.iconv "iconv"} -f UTF-8 -t UTF-16LE \
      | ${lib.getExe pkgs.xxd} -p | tr -d '\n' | tr '[:lower:]' '[:upper:]')
    actual_hex=$(${sqlite} "$dorion_db" \
      "SELECT hex(value) FROM ItemTable WHERE key = 'VencordSettings';")
    test "$actual_hex" = "$expected_hex"
    test "$(${sqlite} "$unrelated_db" 'SELECT COUNT(*) FROM ItemTable;')" -eq 0

    rm -rf ${lib.escapeShellArg testRoot}
    touch "$out"
  ''
