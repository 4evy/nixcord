{
  pkgs,
  lib,
  cfg,
  settings,
  quickCss,
}:
let
  inherit (import ./patching.nix { inherit lib; }) applyPostPatch;
  inherit (import ./files/files.nix { inherit lib; }) mkThemeFile;
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
        native.themes.getThemesList = async () => {
            // Configured themes remain available when browser storage is unavailable
            const storedThemes = await DataStore.entries(themeStore).catch(error => {
                console.error("Failed to read browser themes:", error);
                return [];
            });
            return Object.entries({ ...Object.fromEntries(storedThemes), ...themes })
                .map(([name, css]) => getThemeInfo(css, name));
        };
        native.themes.getThemeData = async name =>
            Object.hasOwn(themes, name) ? themes[name] : await DataStore.get(name, themeStore);
      ''}
    }
  '';
  browserNetworkRules = pkgs.writeText "nixcord-browser-network-rules.js" ''
    // Keep Chromium's compiled rules in the profile, not the read-only extension
    chrome.runtime.onInstalled.addListener(async () => {
        const response = await fetch(chrome.runtime.getURL("modifyResponseHeaders.json"));
        const rules = await response.json();
        const previous = await chrome.declarativeNetRequest.getDynamicRules();
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: previous.map(rule => rule.id),
            addRules: rules
        });
    });
  '';
in
(applyPostPatch {
  inherit cfg;
  pkg = cfg.browser.package;
}).overrideAttrs
  (old: {
    nativeBuildInputs = (old.nativeBuildInputs or [ ]) ++ [ pkgs.jq ];
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
      # Static rules require writing _metadata inside the extension directory
      ${lib.getExe pkgs.jq} 'del(.declarative_net_request)' "$out/manifest.json" > "$out/manifest.json.tmp"
      mv "$out/manifest.json.tmp" "$out/manifest.json"
      cat ${browserNetworkRules} >> "$out/service-worker.js"
      runHook postInstall
    '';
  })
