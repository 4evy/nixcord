{ lib, pkgs }:
{
  client,
  browserBuild,
  settings,
  quickCss,
  themes,
}:
pkgs.runCommand "legcord-${client}"
  {
    nativeBuildInputs = [ pkgs.bun ];
    spec = builtins.toJSON {
      inherit client settings quickCss;
      themes = lib.attrsets.mapAttrs' (
        name: path: lib.attrsets.nameValuePair "${lib.strings.removeSuffix ".css" name}.css" path
      ) themes;
    };
    passAsFile = [ "spec" ];
  }
  ''
    bun ${./legcord-build.ts} "$specPath" ${browserBuild} "$out"
  ''
