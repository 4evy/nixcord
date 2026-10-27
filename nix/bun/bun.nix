{
  bun,
  lib,
  fetchurl,
  stdenvNoCC,
}:
let
  version = "1.4.2";
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
          hash = "sha256-kJh6OhbX21VtiGrD1VHnttPt8KHPQ6yu1iLoZ2vh0S8=";
        };
        aarch64-linux = {
          archive = "bun-linux-aarch64";
          hash = "sha256-VDKLvC2cjgyfiSxUTWbFeoO4QTnjSQnl7oF1jxrI/ac=";
        };
        x86_64-linux = {
          archive = "bun-linux-x64-baseline";
          hash = "sha256-xngEDxT+BEDrg503y9DOTAUaMtpygGrJfeamqra/co8=";
        };
      };
in
# Stable Nixpkgs ships Bun 1.3, which cannot read our version 2 lockfiles
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
