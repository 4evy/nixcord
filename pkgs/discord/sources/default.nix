{
  lib,
  stdenvNoCC,
  fetchurl,
  branch,
  withKrisp,
}:
let
  sources = lib.trivial.importJSON ./sources.json;

  platformName = if stdenvNoCC.hostPlatform.isLinux then "linux" else "osx";
  variantKey = "${platformName}-${branch}";
  source = sources.${variantKey} or (throw "discord: no source defined for ${variantKey}");

  inherit (source) version;

  moduleSrcs = lib.attrsets.mapAttrs (_: mod: fetchurl { inherit (mod) url hash; }) source.modules;

  moduleVersions = lib.attrsets.mapAttrs (_: mod: mod.version) source.modules;

  krispSourceMeta = source.modules.discord_krisp or null;

  krispSrc = if withKrisp && krispSourceMeta != null then moduleSrcs.discord_krisp else null;
in
{
  inherit
    sources
    platformName
    variantKey
    source
    version
    moduleSrcs
    moduleVersions
    krispSourceMeta
    krispSrc
    ;
}
