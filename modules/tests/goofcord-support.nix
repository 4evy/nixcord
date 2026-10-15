{ pkgs }:

let
  testLib = import ./lib { inherit pkgs; };

  evalGoofcord =
    clientMod:
    testLib.eval.hm {
      enable = true;
      discord.enable = false;
      vesktop.enable = true;
      equibop.enable = true;
      extraConfig.clientCoexistence = "global";
      vesktopConfig.clientCoexistence = "vesktop";
      equibopConfig.clientCoexistence = "equibop";
      goofcordConfig.clientCoexistence = "goofcord-${clientMod}";
      quickCss = "body { color: rebeccapurple; }";
      config = {
        useQuickCss = true;
        enabledThemes = [
          "first.css"
          "second.css"
        ];
        themes = {
          first = "a";
          second = "b";
        };
        plugins.alwaysAnimate.enable = true;
      };
      goofcord = {
        enable = true;
        installPackage = false;
        inherit clientMod;
      };
    };

  vencord = evalGoofcord "vencord";
  equicord = evalGoofcord "equicord";

  vencordFiles = vencord._moduleTest.common.files;
  equicordFiles = equicord._moduleTest.common.files;
  vencordPackage = vencord.programs.nixcord.finalPackage.goofcord;
in
pkgs.runCommand "goofcord-support-test" { nativeBuildInputs = [ pkgs.jq ]; } ''
  test -x ${vencordPackage}/bin/goofcord
  ${testLib.lib.strings.optionalString pkgs.stdenvNoCC.hostPlatform.isDarwin ''
    test -x ${vencordPackage}/Applications/GoofCord.app/Contents/MacOS/GoofCord
  ''}

  check_support() {
    local support="$1"
    local settings="$2"
    local settings_key="$3"

    test -s "$support/preVencord.js"
    test -s "$support/postVencord.js"
    test -s "$support/clientMod.js"
    test -s "$support/clientMod.css"

    grep --fixed-strings --quiet '// prevencordmarker' "$support/preVencord.js"
    grep --fixed-strings --quiet '// postvencordmarker' "$support/postVencord.js"
    head --bytes 500 "$support/clientMod.js" | grep --fixed-strings --ignore-case --quiet vencord
    grep --fixed-strings --quiet "$settings_key" "$support/preVencord.js"
    grep --fixed-strings --quiet 'AlwaysAnimate' "$support/preVencord.js"

    test "$(jq --raw-output '.assets.PreVencord' "$settings")" = "$support/preVencord.js"
    test "$(jq --raw-output '.assets.ClientMod' "$settings")" = "$support/clientMod.js"
  }

  check_support \
    ${vencordFiles.goofcordSupport} \
    ${vencordFiles.goofcordSettings} \
    VencordSettings

  check_support \
    ${equicordFiles.goofcordSupport} \
    ${equicordFiles.goofcordSettings} \
    EquicordSettings

  grep --fixed-strings --quiet 'rebeccapurple' ${vencordFiles.goofcordQuickCss}
  printf 'a\nb' > expected-themes.css
  cmp expected-themes.css ${vencordFiles.goofcordThemes}

  ${pkgs.lib.strings.concatMapStringsSep "\n"
    (
      config:
      let
        cfg = config.programs.nixcord;
        support = config._moduleTest.common.files.goofcordSupport;
      in
      ''
        ${testLib.output.json (testLib.output.homeFileSource config "${cfg.vesktop.configDir}/settings/settings.json") ''.clientCoexistence == "vesktop"''}
        ${testLib.output.json (testLib.output.homeFileSource config "${cfg.equibop.configDir}/settings/settings.json") ''.clientCoexistence == "equibop"''}
        grep --fixed-strings --quiet ${pkgs.lib.strings.escapeShellArg ''\"clientCoexistence\":\"goofcord-${cfg.goofcord.clientMod}\"''} \
          ${support}/preVencord.js
        if grep --fixed-strings --quiet --regexp '\"clientCoexistence\":\"vesktop\"' --regexp '\"clientCoexistence\":\"equibop\"' \
          ${support}/preVencord.js; then
          echo 'Desktop client configuration leaked into Goofcord' >&2
          exit 1
        fi
      ''
    )
    [
      vencord
      equicord
    ]
  }

  touch "$out"
''
