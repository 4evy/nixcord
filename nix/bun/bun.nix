{
  bun,
  lib,
  fetchurl,
  stdenvNoCC,
}:
let
  version = "1.4.4";
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
          hash = "sha256-wkDX8My5DCY6hJ/NsJt+5iYw2SE0jtaq/ahrnVd7xRA=";
        };
        aarch64-linux = {
          archive = "bun-linux-aarch64";
          hash = "sha256-uqa7NvUdblhWHgK76oJQOKnfRU9nPW13bou/hvjHhQ4=";
        };
        x86_64-linux = {
          archive = "bun-linux-x64-baseline";
          hash = "sha256-4ERutVmVdy65iUvrrppr42jZhai5Jx7hJEhvmUbu3XY=";
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
