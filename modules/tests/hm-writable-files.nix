{ pkgs }:

let
  testLib = import ./lib { inherit pkgs; };
  destinationRoot = "/tmp/nixcord-hm-writable-files-test";
  config = testLib.eval.hm {
    enable = true;
    discord.vencord.enable = true;
    configDir = "${destinationRoot}/Vencord";
    config.plugins.alwaysAnimate.enable = true;
  };
  activation = config.home.activation.nixcord-vencord-settings.data;
  destination = "${destinationRoot}/Vencord/settings/settings.json";
in
pkgs.runCommand "hm-writable-files-test"
  {
    nativeBuildInputs = [ pkgs.jq ];
  }
  ''
    rm -rf ${destinationRoot}
    mkdir -p ${destinationRoot}/existing ${destinationRoot}/Vencord/settings
    printf 'old\n' > ${destinationRoot}/existing/settings.json
    ln -s ${destinationRoot}/existing/settings.json ${destination}

    ${activation}

    test -f ${destination}
    test ! -L ${destination}
    test -w ${destination}
    jq -e '.plugins.AlwaysAnimate.enabled == true' ${destination}

    chmod 0444 ${destination}
    ${activation}
    test -w ${destination}
    jq -e '.plugins.AlwaysAnimate.enabled == true' ${destination}

    rm -rf ${destinationRoot}
    touch "$out"
  ''
