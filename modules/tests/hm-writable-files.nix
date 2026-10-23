{ pkgs, home-manager }:

let
  testLib = import ./lib { inherit pkgs; };
  destinationRoot = "/tmp/hm-writable-files-test";
  config = testLib.eval.hm {
    enable = true;
    discord.vencord.enable = true;
    configDir = "${destinationRoot}/Vencord";
    config.plugins.alwaysAnimate.enable = true;
  };
  activation = config.home.activation.vencord-settings.data;
  destination = "${destinationRoot}/Vencord/settings/settings.json";
in
pkgs.runCommand "hm-writable-files-test"
  {
    nativeBuildInputs = [ pkgs.jq ];
  }
  ''
    source ${home-manager}/lib/bash/home-manager.sh
    rm --recursive --force ${destinationRoot}
    mkdir --parents ${destinationRoot}/existing ${destinationRoot}/Vencord/settings
    printf 'old\n' > ${destinationRoot}/existing/settings.json
    ln --symbolic ${destinationRoot}/existing/settings.json ${destination}

    export DRY_RUN=1
    ${activation}
    test -L ${destination}
    grep --fixed-strings --line-regexp old ${destination}
    test "$(readlink ${destination})" = '${destinationRoot}/existing/settings.json'
    unset DRY_RUN
    ${activation}

    test -f ${destination}
    test ! -L ${destination}
    test -w ${destination}
    jq --exit-status '.plugins.AlwaysAnimate.enabled == true' ${destination}

    chmod 0444 ${destination}
    cp ${destination} before.json
    export DRY_RUN=1
    ${activation}
    test ! -w ${destination}
    cmp before.json ${destination}
    unset DRY_RUN
    ${activation}
    test -w ${destination}
    jq --exit-status '.plugins.AlwaysAnimate.enabled == true' ${destination}

    rm --recursive --force ${destinationRoot}
    export DRY_RUN=1
    ${activation}
    ${config.home.activation.disableDiscordUpdates.data}
    ${config.home.activation.fixDiscordModules.data}
    test ! -e ${destinationRoot}
    unset DRY_RUN
    touch "$out"
  ''
