{
  bun,
  lib,
  fetchurl,
  stdenvNoCC,
}:
let
  version = "1.4.3";
  sources =
    lib.mapAttrs
      (
        _: source:
        fetchurl {
          url = "https://github.com/oven-sh/bun/releases/download/bun-v${version}/${source.archive}.zip";
          inherit (source) hash;
        }
      )
      {
        aarch64-darwin = {
          archive = "bun-darwin-aarch64";
          hash = "sha256-gK/UwGm0am+o8+xSC+vHUKeEPkqNW5WD0prUNsAKNAM=";
        };
        aarch64-linux = {
          archive = "bun-linux-aarch64";
          hash = "sha256-76mBPaXtckI7+Ef5FujSxHwNd2rdlyNUAmp14Q2pqiE=";
        };
        x86_64-linux = {
          archive = "bun-linux-x64-baseline";
          hash = "sha256-H8LtrIQxApCeOhvh2NmALMYHHPB05n6IIx9P/g+LOXs=";
        };
      };
in
# Bun 1.4.3 supports the scoped overrides needed by upstream catalog dependencies
if lib.versionAtLeast bun.version version then
  bun
else
  bun.overrideAttrs (previous: {
    inherit version;
    src = sources.${stdenvNoCC.hostPlatform.system};
    passthru = previous.passthru // {
      inherit sources;
    };
    meta = previous.meta // {
      platforms = builtins.attrNames sources;
    };
  })
