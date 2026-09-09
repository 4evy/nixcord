{ pkgs, home-manager }:

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
    source ${home-manager}/lib/bash/home-manager.sh
    rm -rf ${destinationRoot}
    mkdir -p ${destinationRoot}/existing ${destinationRoot}/Vencord/settings
    printf 'old\n' > ${destinationRoot}/existing/settings.json
    ln -s ${destinationRoot}/existing/settings.json ${destination}

    export DRY_RUN=1
    ${activation}
    test -L ${destination}
    grep -Fx old ${destination}
    test "$(readlink ${destination})" = '${destinationRoot}/existing/settings.json'
    unset DRY_RUN
    ${activation}

    test -f ${destination}
    test ! -L ${destination}
    test -w ${destination}
    jq -e '.plugins.AlwaysAnimate.enabled == true' ${destination}

    chmod 0444 ${destination}
    cp ${destination} before.json
    export DRY_RUN=1
    ${activation}
    test ! -w ${destination}
    cmp before.json ${destination}
    unset DRY_RUN
    ${activation}
    test -w ${destination}
    jq -e '.plugins.AlwaysAnimate.enabled == true' ${destination}

    rm -rf ${destinationRoot}
    export DRY_RUN=1
    ${activation}
    ${config.home.activation.disableDiscordUpdates.data}
    ${config.home.activation.fixDiscordModules.data}
    test ! -e ${destinationRoot}
    unset DRY_RUN
    touch "$out"
  ''
