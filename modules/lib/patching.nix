{ lib, ... }:
let
  applyPostPatch =
    { cfg, pkg }:
    pkg.overrideAttrs (o: {
      buildFlags =
        let
          flags =
            o.buildFlags or [
              "--standalone"
              "--disable-updater"
            ];
        in
        if cfg.userPlugins == { } then flags else lib.lists.remove "--standalone" flags ++ [ "--dev" ];

      postPatch =
        (o.postPatch or "")
        + lib.strings.optionalString (cfg.userPlugins != { }) ''
          mkdir --parents src/userplugins
          ${lib.strings.concatMapAttrsStringSep "\n" (
            name: path:
            "cp --recursive ${lib.strings.escapeShellArg "${path}"} src/userplugins/${lib.strings.escapeShellArg name}"
          ) cfg.userPlugins}
        '';

      postInstall = (o.postInstall or "") + ''
        cp package.json "$out"
      '';
    });

  mkBrowserBuild =
    { cfg, client }:
    let
      browserDir =
        {
          vencord = "dist";
          equicord = "dist/browser";
        }
        .${client};
    in
    (applyPostPatch {
      inherit cfg;
      pkg = cfg.discord.${client}.package;
    }).overrideAttrs
      (_old: {
        buildPhase = ''
          runHook preBuild
          flagsArray=()
          concatTo flagsArray buildFlags
          bun run --bun buildWeb "''${flagsArray[@]}"
          runHook postBuild
        '';
        installPhase = ''
          runHook preInstall
          mkdir --parents "$out"
          cp ${browserDir}/browser.js "$out/browser.js"
          cp ${browserDir}/browser.css "$out/browser.css"
          runHook postInstall
        '';
      });

in
{
  inherit applyPostPatch mkBrowserBuild;
}
