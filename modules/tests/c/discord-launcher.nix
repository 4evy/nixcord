{ pkgs }:

let
  inherit (pkgs) lib;

  # CI validates the launcher with final C23 support even when the platform
  # default compiler still reports a draft C2x __STDC_VERSION__.
  cStdenv = pkgs.llvmPackages_latest.stdenv;
  requiredCVersion = "202311L";

  strictCFlags = [
    "-std=c23"
    "-Wall"
    "-Wextra"
    "-Wpedantic"
    "-Wconversion"
    "-Wsign-conversion"
    "-Wcast-qual"
    "-Wwrite-strings"
    "-Wformat=2"
    "-Wshadow"
    "-Wstrict-prototypes"
    "-Wmissing-prototypes"
    "-Wold-style-definition"
    "-Wundef"
    "-Wvla"
    "-Walloca"
    "-Werror"
    "-Os"
  ];

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
      runStaticAnalysis ? false,
    }:
    ''
      printf "" | cc -std=c23 -dM -E - | grep -F '#define __STDC_VERSION__ ${requiredCVersion}'

      cat > ${name}-target <<'EOF'
      #!${pkgs.runtimeShell}
      printf '%s\n' "$@" > ${name}.args
      printf '%s\n' "$DISCORD_USER_DATA_DIR" > ${name}.data-dir
      printf '%s\n' "''${VENCORD_USER_DATA_DIR-}''${EQUICORD_USER_DATA_DIR-}" > ${name}.mod-dir
      EOF
      chmod +x ${name}-target

      cp ${../../../pkgs/discord/platforms/darwin/launcher/main.c} ${name}.c
      substituteInPlace ${name}.c \
        --replace-fail "@app_data_dir_file@" ${pkgs.writeText "launcher-app-data-dir" appDataDir} \
        --replace-fail "@mod_data_dir_file@" ${pkgs.writeText "launcher-mod-data-dir" modDataDir} \
        --replace-fail "@mod_data_env@" ${lib.strings.escapeShellArg modDataEnv} \
        --replace-fail "@mod_data_suffix@" ${lib.strings.escapeShellArg modDataSuffix} \
        --replace-fail "@stage_modules@" "${stageModules}" \
        --replace-fail "@modules_dir@" "$TMPDIR/modules" \
        --replace-fail "@deploy_krisp@" "${if enableKrisp then trueBin else ""}" \
        --replace-fail "@target@" "$PWD/${name}-target" \
        --replace-fail "@enable_krisp@" "${if enableKrisp then "1" else "0"}" \
        --replace-fail "@command_line_args@" ${
          lib.strings.escapeShellArg (
            lib.strings.concatMapStrings (arg: ''
              (char[]){
              #embed "${pkgs.writeText "launcher-argument" arg}" suffix(,)
                0
              },
            '') commandLineArgs
          )
        }

        cc ${lib.strings.escapeShellArgs strictCFlags} -o ${name} ${name}.c
        ${lib.strings.optionalString runStaticAnalysis ''
          cppcheck \
            --std=c23 \
            --enable=warning,style,performance,portability \
            --error-exitcode=1 \
            --suppress=missingIncludeSystem \
            --suppress=normalCheckLevelMaxBranches \
            ${name}.c
        ''}
        ${
          if expectedStatus == 0 then
            ''
              ./${name} --nixcord-c-launcher-smoke
              diff -u <(printf '%s\n' ${lib.strings.escapeShellArgs expectedArgs}) ${name}.args
              diff -u <(printf '%s\n' "${expectedDataDir}") ${name}.data-dir
              diff -u <(printf '%s\n' "${expectedModDir}") ${name}.mod-dir
            ''
          else
            ''
              set +e
              ./${name} --nixcord-c-launcher-smoke
              status=$?
              set -e
              test "$status" -eq ${toString expectedStatus}
              test ! -e ${name}.args
            ''
        }
    '';
in
pkgs.runCommand "discord-launcher-c-check"
  {
    nativeBuildInputs = [
      cStdenv.cc
      pkgs.cppcheck
    ];
  }
  ''
    unset DISCORD_USER_DATA_DIR VENCORD_USER_DATA_DIR EQUICORD_USER_DATA_DIR

    cat > failing-stage-modules <<'EOF'
    #!${pkgs.runtimeShell}
    exit 23
    EOF
    chmod +x failing-stage-modules

    cat > check-environment <<'EOF'
    #!${pkgs.runtimeShell}
    set -eu
    test "$DISCORD_USER_DATA_DIR" = "$HOME/Library/Application Support/nixcord"
    test "$VENCORD_USER_DATA_DIR" = "$HOME/Library/Application Support/Vencord"
    EOF
    chmod +x check-environment

    ${compileAndSmoke {
      name = "discord-launcher-full";
      enableKrisp = true;
      stageModules = "$PWD/check-environment";
      modDataEnv = "VENCORD_USER_DATA_DIR";
      expectedModDir = "$HOME/Library/Application Support/Vencord";
      runStaticAnalysis = true;
      commandLineArgs = [
        "--enable-blink-features=MiddleClickAutoscroll"
        "--ozone-platform-hint=auto"
        "--enable-wayland-ime"
        specialCommandLineArg
        "--profilé=тест"
        ""
      ];
      expectedArgs = [
        "--nixcord-c-launcher-smoke"
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
      expectedArgs = [ "--nixcord-c-launcher-smoke" ];
    }}
    ${compileAndSmoke {
      name = "discord-launcher-helper-failure";
      enableKrisp = false;
      stageModules = "$PWD/failing-stage-modules";
      expectedStatus = 23;
    }}

    ${compileAndSmoke {
      name = "discord-launcher-configured";
      enableKrisp = false;
      appDataDir = "/tmp/nixcord données";
      modDataDir = "/tmp/Equicord settings";
      modDataEnv = "EQUICORD_USER_DATA_DIR";
      expectedDataDir = "/tmp/nixcord données";
      expectedModDir = "/tmp/Equicord settings";
      expectedArgs = [ "--nixcord-c-launcher-smoke" ];
    }}

    DISCORD_USER_DATA_DIR="$TMPDIR/inherited data" ./discord-launcher-minimal
    grep -Fx "$TMPDIR/inherited data" discord-launcher-minimal.data-dir
    DISCORD_USER_DATA_DIR="$TMPDIR/ignored" EQUICORD_USER_DATA_DIR="$TMPDIR/ignored" \
      ./discord-launcher-configured
    grep -Fx '/tmp/nixcord données' discord-launcher-configured.data-dir
    grep -Fx '/tmp/Equicord settings' discord-launcher-configured.mod-dir
    rm discord-launcher-minimal.args
    if DISCORD_USER_DATA_DIR=relative ./discord-launcher-minimal; then
      echo 'relative data directory was accepted' >&2
      exit 1
    fi
    test ! -e discord-launcher-minimal.args

    touch "$out"
  ''
