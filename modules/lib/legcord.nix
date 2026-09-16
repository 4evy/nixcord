{ lib, pkgs }:
{
  client,
  browserBuild,
  settings,
  quickCss,
  themes,
}:
pkgs.runCommand "nixcord-legcord-${client}"
  {
    nativeBuildInputs = [ pkgs.nodejs ];
    spec = builtins.toJSON {
      inherit client settings quickCss;
      themes = lib.attrsets.mapAttrs' (
        name: path: lib.attrsets.nameValuePair "${lib.strings.removeSuffix ".css" name}.css" path
      ) themes;
    };
    passAsFile = [ "spec" ];
  }
  ''
    node ${./legcord-build.ts} "$specPath" ${browserBuild} "$out"
  ''
