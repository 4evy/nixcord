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
    {
      cfg,
      pkg,
      browserJsPath,
      browserCssPath,
    }:
    (applyPostPatch { inherit cfg pkg; }).overrideAttrs (_old: {
      buildPhase = ''
        runHook preBuild
        pnpm run buildWeb -- --standalone --disable-updater
        runHook postBuild
      '';
      installPhase = ''
        runHook preInstall
        mkdir -p "$out"
        cp ${browserJsPath} "$out/browser.js"
        cp ${browserCssPath} "$out/browser.css"
        runHook postInstall
      '';
    });

in
{
  inherit applyPostPatch mkBrowserBuild;
}
