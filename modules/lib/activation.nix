{
  lib,
  pkgs,
  cfg,
  mkVencordCfg,
  wrapScript,
}:
let
  inherit (import ./discord.nix { inherit lib; })
    branchDirName
    disabledUpdateSettings
    getDiscordConfigDirs
    packageSupportsOverride
    ;

  inherit (cfg) homeDirectory xdgConfigHome;
  disabledUpdateSettingsJson = builtins.toJSON disabledUpdateSettings;
  disabledUpdateSettingsJq = lib.strings.escapeShellArg ". + ${disabledUpdateSettingsJson}";
  dorionSettings =
    pkgs.runCommand "dorion-vencord-settings-utf16le"
      {
        settings = builtins.toJSON (mkVencordCfg (lib.attrsets.recursiveUpdate cfg.config cfg.extraConfig));
        passAsFile = [ "settings" ];
        nativeBuildInputs = [ pkgs.iconv ];
      }
      ''
        iconv --from-code=UTF-8 --to-code=UTF-16LE "$settingsPath" > "$out"
      '';
  discordConfigBase =
    if
      (cfg.discord.appDataDir or null) != null
      || packageSupportsOverride (cfg.discord.package or { }) "appDataDir"
    then
      builtins.dirOf (toString cfg.discord.configDir)
    else
      "${homeDirectory}/Library/Application Support";
  discordModuleConfigDirs = map (
    branch:
    "${if pkgs.stdenvNoCC.hostPlatform.isDarwin then discordConfigBase else xdgConfigHome}/${branch}"
  ) (builtins.attrValues branchDirName);
in
{
  disableDiscordUpdates = wrapScript ''
    set -o errexit -o nounset -o pipefail
    ${lib.meta.getExe' pkgs.coreutils "install"} --directory --owner ${lib.strings.escapeShellArg cfg.user} ${lib.strings.optionalString pkgs.stdenvNoCC.hostPlatform.isDarwin "--group staff"} ${
      lib.strings.escapeShellArgs ([ cfg.configDir ] ++ getDiscordConfigDirs cfg)
    }
    for config_dir in ${lib.strings.escapeShellArgs (getDiscordConfigDirs cfg)}; do
      if [ -f "$config_dir/settings.json" ]; then
        ${lib.meta.getExe' pkgs.jq "jq"} ${disabledUpdateSettingsJq} "$config_dir/settings.json" > "$config_dir/settings.json.tmp" && mv "$config_dir/settings.json.tmp" "$config_dir/settings.json"
      else
        echo '${disabledUpdateSettingsJson}' > "$config_dir/settings.json"
      fi
    done
  '';

  fixDiscordModules = wrapScript ''
    set -o errexit -o nounset -o pipefail

    for config_dir in ${lib.strings.escapeShellArgs discordModuleConfigDirs}; do
      [ ! -d "$config_dir" ] && continue
      (
        cd "$config_dir" || exit 0
        versions=($(${lib.meta.getExe' pkgs.coreutils "ls"} --format=single-column --directory [0-9]*.[0-9]*.[0-9]* 2>/dev/null | ${lib.meta.getExe' pkgs.coreutils "sort"} --version-sort || true))
        n=''${#versions[@]}
        if [ "$n" -ge 2 ]; then
          prev="''${versions[$((n-2))]}"
          curr="''${versions[$((n-1))]}"
          prev_modules="$config_dir/$prev/modules"
          curr_modules="$config_dir/$curr/modules"
          if [ ! -d "$curr_modules" ] || [ "$(${lib.meta.getExe' pkgs.coreutils "ls"} --almost-all "$curr_modules" 2>/dev/null | ${lib.meta.getExe pkgs.gnugrep} --invert-match '^pending$' | ${lib.meta.getExe' pkgs.coreutils "wc"} --lines)" -eq 0 ]; then
            if [ -d "$prev_modules" ]; then
              echo "Copying Discord modules for ''${config_dir##*/} from $prev to $curr"
              ${lib.meta.getExe' pkgs.coreutils "rm"} --recursive --force "$curr_modules"
              ${lib.meta.getExe' pkgs.coreutils "cp"} --archive "$prev_modules" "$curr_modules"
            fi
          fi
        fi
      )
    done
  '';

  setupDorionVencordSettings = wrapScript ''
    set -o errexit -o nounset -o pipefail

    webkit_base_dir=${
      lib.strings.escapeShellArg (
        if pkgs.stdenvNoCC.hostPlatform.isDarwin then
          "${homeDirectory}/Library/WebKit/com.spikehd.dorion/WebsiteData/Default"
        else
          "${homeDirectory}/.local/share/dorion/profiles/default/webdata/localstorage"
      )
    }

    while IFS= read -r -d ''' sqlite_file; do
      if ${lib.meta.getExe pkgs.sqlite} "$sqlite_file" "SELECT COUNT(*) FROM ItemTable WHERE key = 'VencordSettings';" 2>/dev/null | ${lib.meta.getExe pkgs.gnugrep} --quiet "1"; then
        ${lib.meta.getExe pkgs.sqlite} "$sqlite_file" \
          "UPDATE ItemTable SET value = readfile('${dorionSettings}') WHERE key = 'VencordSettings';"
      fi
    done < <(find "$webkit_base_dir" \( -name "*.sqlite3" -or -name "*.localstorage" \) -type f -print0 2>/dev/null)
  '';
}
