{ lib, ... }:
let
  applyPostPatch =
    { cfg, pkg }:
    pkg.overrideAttrs (o: {
      postPatch =
        (o.postPatch or "")
        + lib.strings.optionalString (cfg.userPlugins != { }) ''
          mkdir -p src/userplugins
          ${lib.strings.concatMapAttrsStringSep "\n" (
            name: path:
            "cp -r ${lib.strings.escapeShellArg "${path}"} src/userplugins/${lib.strings.escapeShellArg name}"
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
          pnpm run buildWeb -- --standalone --disable-updater
          runHook postBuild
        '';
        installPhase = ''
          runHook preInstall
          mkdir -p "$out"
          cp ${browserDir}/browser.js "$out/browser.js"
          cp ${browserDir}/browser.css "$out/browser.css"
          runHook postInstall
        '';
      });

in
{
  inherit applyPostPatch mkBrowserBuild;
}
