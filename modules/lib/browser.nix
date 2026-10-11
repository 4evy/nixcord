{
  pkgs,
  lib,
  cfg,
  settings,
  quickCss,
}:
let
  inherit (import ./patching.nix { inherit lib; }) applyPostPatch;
  inherit (import ./files.nix { inherit lib; }) mkThemeFile;
  themes = lib.lists.imap0 (index: name: {
    inherit index name;
    path = mkThemeFile { inherit pkgs; } name cfg.config.themes.${name};
  }) (builtins.attrNames cfg.config.themes);
  renderThemes = render: lib.strings.concatMapStringsSep "\n" render themes;
  browserDir = if cfg.browser.client == "equicord" then "dist/browser" else "dist";
  browserConfig = pkgs.writeText "nixcord-browser.ts" ''
    ${renderThemes (
      theme:
      ''import theme${toString theme.index} from "file://nix-themes/${toString theme.index}.css?trim=false";''
    )}
    {
        function merge(current: any, managed: any): any {
            const result = { ...current };
            for (const [key, value] of Object.entries(managed)) {
                result[key] = value !== null && typeof value === "object" && !Array.isArray(value)
                    ? merge(result[key], value)
                    : value;
            }
            return result;
        }
        const native = window.VencordNative;
        const getSettings = native.settings.get;
        native.settings.get = () => merge(getSettings(), ${
          builtins.toJSON (builtins.removeAttrs settings [ "themes" ])
        });
        ${lib.strings.optionalString (quickCss != null) ''
          native.quickCss.get = async () => ${builtins.toJSON quickCss};
        ''}
        ${lib.strings.optionalString (themes != [ ]) ''
          const themes: Record<string, string> = {
              ${renderThemes (theme: "${builtins.toJSON "${theme.name}.css"}: theme${toString theme.index},")}
          };
          native.themes.getThemesList = async () =>
              Object.entries({ ...Object.fromEntries(await DataStore.entries(themeStore)), ...themes })
                  .map(([name, css]) => getThemeInfo(css, name));
          native.themes.getThemeData = async name => themes[name] ?? await DataStore.get(name, themeStore);
        ''}
    }
  '';
in
(applyPostPatch {
  inherit cfg;
  pkg = cfg.browser.package;
}).overrideAttrs
  (old: {
    postPatch = (old.postPatch or "") + ''
      cat ${browserConfig} >> browser/VencordNativeStub.ts
      ${lib.strings.optionalString (themes != [ ]) ''
        mkdir -p browser/nix-themes
        ${renderThemes (
          theme:
          "cp ${lib.strings.escapeShellArg "${theme.path}"} browser/nix-themes/${toString theme.index}.css"
        )}
      ''}
    '';
    installPhase = ''
      runHook preInstall
      cp -r ${browserDir}/chromium-unpacked "$out"
      runHook postInstall
    '';
  })
