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

  sanitizerCFlags = strictCFlags ++ [
    "-O1"
    "-g"
    "-fsanitize=address,undefined"
    "-fno-omit-frame-pointer"
  ];

  trueBin = "${lib.meta.getExe' pkgs.coreutils "true"}";
  specialCommandLineArg = "--flag=quote\"backslash\\space y";

  compileAndSmoke =
    {
      name,
      enableKrisp,
      commandLineArgDeclarations ? "",
      commandLineArgs ? "",
      commandLineArgsCount ? 0,
      expectedArgs,
    }:
    ''
      printf "" | cc -std=c23 -dM -E - | grep -F '#define __STDC_VERSION__ ${requiredCVersion}'

      cat > ${name}-target <<'EOF'
      #!${pkgs.runtimeShell}
      printf '%s\n' "$@" > ${name}.args
      EOF
      chmod +x ${name}-target

      cp ${../../../pkgs/discord/src/discord-launcher.c} ${name}.c
      substituteInPlace ${name}.c \
        --replace-fail "@disable_breaking_updates@" "${trueBin}" \
        --replace-fail "@stage_modules@" "${trueBin}" \
        --replace-fail "@modules_dir@" "$TMPDIR/modules" \
        --replace-fail "@deploy_krisp@" "${if enableKrisp then trueBin else ""}" \
        --replace-fail "@target@" "$PWD/${name}-target" \
        --replace-fail "@enable_krisp@" "${if enableKrisp then "1" else "0"}" \
        --replace-fail "@command_line_arg_declarations@" ${lib.strings.escapeShellArg commandLineArgDeclarations} \
        --replace-fail "@command_line_args@" ${lib.strings.escapeShellArg commandLineArgs} \
        --replace-fail "@command_line_args_count@" "${toString commandLineArgsCount}"

        cc ${lib.strings.escapeShellArgs strictCFlags} -o ${name} ${name}.c
        cc ${lib.strings.escapeShellArgs sanitizerCFlags} -o ${name}-sanitized ${name}.c
        cppcheck \
          --std=c23 \
          --enable=warning,style,performance,portability \
          --error-exitcode=1 \
          --suppress=missingIncludeSystem \
          --suppress=normalCheckLevelMaxBranches \
          ${name}.c
        ./${name} --nixcord-c-launcher-smoke
        diff -u <(printf '%s\n' ${lib.strings.escapeShellArgs expectedArgs}) ${name}.args
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
    ${compileAndSmoke {
      name = "discord-launcher-full";
      enableKrisp = true;
      commandLineArgDeclarations = ''
        static char command_line_arg_0[] = "--enable-blink-features=MiddleClickAutoscroll";
        static char command_line_arg_1[] = "--ozone-platform-hint=auto";
        static char command_line_arg_2[] = "--enable-wayland-ime";
        static char command_line_arg_3[] = "${lib.strings.escapeC (lib.strings.stringToCharacters specialCommandLineArg) specialCommandLineArg}";
      '';
      commandLineArgs = "command_line_arg_0, command_line_arg_1, command_line_arg_2, command_line_arg_3,";
      commandLineArgsCount = 4;
      expectedArgs = [
        "--nixcord-c-launcher-smoke"
        "--enable-blink-features=MiddleClickAutoscroll"
        "--ozone-platform-hint=auto"
        "--enable-wayland-ime"
        specialCommandLineArg
      ];
    }}
    ${compileAndSmoke {
      name = "discord-launcher-minimal";
      enableKrisp = false;
      expectedArgs = [ "--nixcord-c-launcher-smoke" ];
    }}

    touch "$out"
  ''
