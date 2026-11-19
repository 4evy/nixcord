{
  bun,
  lib,
  fetchurl,
  stdenvNoCC,
}:
let
  version = "1.4.5";
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
          hash = "sha256-tda8LhPK8U5XyJZh6J79Bz/xYWW0G/5DiCYWQQYJzRA=";
        };
        aarch64-linux = {
          archive = "bun-linux-aarch64";
          hash = "sha256-GGVqO/DqVkH1eWrkITt1JVV5pwoP3tLzN5M3hVaM34Q=";
        };
        x86_64-linux = {
          archive = "bun-linux-x64-baseline";
          hash = "sha256-3LI6GKHC//EtV7zvaW27tC62f94p9DgW7LWVRZokxGM=";
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
