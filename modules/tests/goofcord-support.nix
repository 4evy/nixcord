{ pkgs }:

let
  testLib = import ./lib { inherit pkgs; };

  evalGoofcord =
    clientMod:
    testLib.eval.hm {
      enable = true;
      discord.enable = false;
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

  vencordFiles = vencord._nixcordTest.common.files;
  equicordFiles = equicord._nixcordTest.common.files;
  vencordPackage = vencord.programs.nixcord.finalPackage.goofcord;
in
pkgs.runCommand "goofcord-support-test" { nativeBuildInputs = [ pkgs.jq ]; } ''
  test -x ${vencordPackage}/bin/goofcord
  ${testLib.lib.optionalString pkgs.stdenvNoCC.isDarwin ''
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

    grep -Fq '// prevencordmarker' "$support/preVencord.js"
    grep -Fq '// postvencordmarker' "$support/postVencord.js"
    head -c 500 "$support/clientMod.js" | grep -Fiq vencord
    grep -Fq "$settings_key" "$support/preVencord.js"
    grep -Fq 'AlwaysAnimate' "$support/preVencord.js"

    test "$(jq -r '.assets.NixcordPreVencord' "$settings")" = "$support/preVencord.js"
    test "$(jq -r '.assets.NixcordClientMod' "$settings")" = "$support/clientMod.js"
  }

  check_support \
    ${vencordFiles.goofcordSupport} \
    ${vencordFiles.goofcordSettings} \
    VencordSettings

  check_support \
    ${equicordFiles.goofcordSupport} \
    ${equicordFiles.goofcordSettings} \
    EquicordSettings

  grep -Fq 'rebeccapurple' ${vencordFiles.goofcordQuickCss}
  printf 'a\nb' > expected-themes.css
  cmp expected-themes.css ${vencordFiles.goofcordThemes}

  touch "$out"
''
