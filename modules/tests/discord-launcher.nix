{ pkgs }:

let
  inherit (pkgs) lib;

  trueBin = lib.meta.getExe' pkgs.coreutils "true";
  specialCommandLineArg = "--flag=quote\"backslash\\space y";

  compileAndSmoke =
    {
      name,
      enableKrisp,
      stageModules ? trueBin,
      appDataDir ? "",
      modDataDir ? "",
      modDataEnv ? "",
      modDataSuffix ? "/Library/Application Support/Vencord",
      expectedDataDir ? "$HOME/Library/Application Support/nixcord",
      expectedModDir ? "",
      commandLineArgs ? [ ],
      expectedArgs ? [ ],
      expectedStatus ? 0,
    }:
    let
      launcher = pkgs.callPackage ../../pkgs/discord/platforms/darwin/launcher {
        configuration = {
          directories = [
            {
              name = "DISCORD_USER_DATA_DIR";
              configured = appDataDir;
              suffix = "Library/Application Support/nixcord";
            }
          ]
          ++ lib.optional (modDataEnv != "") {
            name = modDataEnv;
            configured = modDataDir;
            suffix = lib.removePrefix "/" modDataSuffix;
          };
          stage_modules = stageModules;
          modules_dir = "modules";
          deploy_krisp = if enableKrisp then trueBin else null;
          target = "${name}-target";
          command_line_args = commandLineArgs;
        };
      };
    in
    ''
      cat > ${name}-target <<'EOF'
      #!${pkgs.runtimeShell}
      printf '%s\n' "$@" > ${name}.args
      printf '%s\n' "$DISCORD_USER_DATA_DIR" > ${name}.data-dir
      printf '%s\n' "''${VENCORD_USER_DATA_DIR-}''${EQUICORD_USER_DATA_DIR-}" > ${name}.mod-dir
      EOF
      chmod +x ${name}-target

      cp ${lib.getExe launcher} ${name}
      mkdir --parents bin
      ln --symbolic "$PWD/${name}" "bin/${name}"
      ${
        if expectedStatus == 0 then
          ''
            ./bin/${name} --launcher-smoke
            diff --unified <(printf '%s\n' ${lib.strings.escapeShellArgs expectedArgs}) ${name}.args
            diff --unified <(printf '%s\n' "${expectedDataDir}") ${name}.data-dir
            diff --unified <(printf '%s\n' "${expectedModDir}") ${name}.mod-dir
          ''
        else
          ''
            set +o errexit
            ./bin/${name} --launcher-smoke
            status=$?
            set -o errexit
            test "$status" -eq ${toString expectedStatus}
            test ! -e ${name}.args
          ''
      }
    '';
in
pkgs.runCommand "discord-launcher-check" { } ''
  unset DISCORD_USER_DATA_DIR VENCORD_USER_DATA_DIR EQUICORD_USER_DATA_DIR

  cat > failing-stage-modules <<'EOF'
  #!${pkgs.runtimeShell}
  exit 23
  EOF
  chmod +x failing-stage-modules

  cat > check-environment <<'EOF'
  #!${pkgs.runtimeShell}
  set -o errexit -o nounset
  test "$DISCORD_USER_DATA_DIR" = "$HOME/Library/Application Support/nixcord"
  test "$VENCORD_USER_DATA_DIR" = "$HOME/Library/Application Support/Vencord"
  EOF
  chmod +x check-environment

  ${compileAndSmoke {
    name = "discord-launcher-full";
    enableKrisp = true;
    stageModules = "./check-environment";
    modDataEnv = "VENCORD_USER_DATA_DIR";
    expectedModDir = "$HOME/Library/Application Support/Vencord";
    commandLineArgs = [
      "--enable-blink-features=MiddleClickAutoscroll"
      "--ozone-platform-hint=auto"
      "--enable-wayland-ime"
      specialCommandLineArg
      "--profilé=тест"
      ""
    ];
    expectedArgs = [
      "--launcher-smoke"
      "--enable-blink-features=MiddleClickAutoscroll"
      "--ozone-platform-hint=auto"
      "--enable-wayland-ime"
      specialCommandLineArg
      "--profilé=тест"
      ""
    ];
  }}
  ${compileAndSmoke {
    name = "discord-launcher-minimal";
    enableKrisp = false;
    expectedArgs = [ "--launcher-smoke" ];
  }}
  ${compileAndSmoke {
    name = "discord-launcher-helper-failure";
    enableKrisp = false;
    stageModules = "./failing-stage-modules";
    expectedStatus = 23;
  }}

  ${compileAndSmoke {
    name = "discord-launcher-configured";
    enableKrisp = false;
    appDataDir = "/tmp/client données";
    modDataDir = "/tmp/Equicord settings";
    modDataEnv = "EQUICORD_USER_DATA_DIR";
    expectedDataDir = "/tmp/client données";
    expectedModDir = "/tmp/Equicord settings";
    expectedArgs = [ "--launcher-smoke" ];
  }}

  DISCORD_USER_DATA_DIR="$TMPDIR/inherited data" ./discord-launcher-minimal
  grep --fixed-strings --line-regexp "$TMPDIR/inherited data" discord-launcher-minimal.data-dir
  DISCORD_USER_DATA_DIR="$TMPDIR/ignored" EQUICORD_USER_DATA_DIR="$TMPDIR/ignored" \
    ./discord-launcher-configured
  grep --fixed-strings --line-regexp '/tmp/client données' discord-launcher-configured.data-dir
  grep --fixed-strings --line-regexp '/tmp/Equicord settings' discord-launcher-configured.mod-dir
  rm discord-launcher-minimal.args
  if DISCORD_USER_DATA_DIR=relative ./discord-launcher-minimal; then
    echo 'relative data directory was accepted' >&2
    exit 1
  fi
  test ! -e discord-launcher-minimal.args

  touch "$out"
''
