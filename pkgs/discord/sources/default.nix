{
  lib,
  stdenvNoCC,
  fetchurl,
  branch,
  withKrisp,
  source ? null,
}:
let
  sources = lib.trivial.importJSON ./sources.json;

  platformName = if stdenvNoCC.hostPlatform.isLinux then "linux" else "osx";
  variantKey = "${platformName}-${branch}";
  selectedSource =
    if source != null then
      source
    else
      sources.${variantKey} or (throw "discord: no source defined for ${variantKey}");

  inherit (selectedSource) version;

  # Disabled Krisp must not be fetched or installed into the package
  modules = lib.attrsets.filterAttrs (
    name: _: withKrisp || name != "discord_krisp"
  ) selectedSource.modules;

  moduleSrcs = lib.attrsets.mapAttrs (_: mod: fetchurl { inherit (mod) url hash; }) modules;

  moduleVersions = lib.attrsets.mapAttrs (_: mod: mod.version) modules;

  krispSourceMeta = selectedSource.modules.discord_krisp or null;

  krispSrc = if withKrisp && krispSourceMeta != null then moduleSrcs.discord_krisp else null;
in
{
  source = selectedSource;
  inherit
    sources
    platformName
    variantKey
    version
    moduleSrcs
    moduleVersions
    krispSourceMeta
    krispSrc
    ;
}
