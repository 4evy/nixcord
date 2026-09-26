{
  lib,
  stdenvNoCC,
  fetchurl,
  makeWrapper,
  pnpm_12,
}:
let
  version = "12.6.0";
  sources = {
    x86_64-linux = {
      platform = "linux-x64-musl";
      hash = "bf23d242a6c7a4d42b21bf1d93bff9d6a473cf8b6a7a990c6ed3094228513048";
    };
    aarch64-linux = {
      platform = "linux-arm64-musl";
      hash = "61e5a2b9aa8c1ebb73ea22203021531f88b8aff9499b68be03f695d9377928c1";
    };
    aarch64-darwin = {
      platform = "darwin-arm64";
      hash = "1030f38e14fa2e6c87fe6ab0313a3bf3b794a961504f4439bad2ca2110d3583e";
    };
    x86_64-darwin = {
      platform = "darwin-x64";
      hash = "baee033929fd76bdf0193ea35aad6efa7ac2931b96f2780328d244c70174306a";
    };
  };
  source = sources.${stdenvNoCC.hostPlatform.system};
in
# Use upstream binaries to avoid compiling Rust on every fresh CI runner.
# Regenerate both clients' pnpmDepsHash values when updating this version.
stdenvNoCC.mkDerivation {
  pname = "pnpm";
  inherit version;
  src = fetchurl {
    url = "https://github.com/pnpm/pnpm/releases/download/v${version}/pnpm-${source.platform}.tar.gz";
    sha256 = source.hash;
  };
  nativeBuildInputs = [ makeWrapper ];
  dontUnpack = true;
  dontBuild = true;
  installPhase = ''
    runHook preInstall
    mkdir -p "$out/bin"
    tar -xzf "$src" -C "$out/bin"
    makeWrapper "$out/bin/pnpm" "$out/bin/pnpx" --add-flags dlx
    ln -s pnpm "$out/bin/pn"
    ln -s pnpx "$out/bin/pnx"
    runHook postInstall
  '';
  passthru = {
    inherit (pnpm_12) nodejs-slim;
    majorVersion = lib.versions.major version;
  };
  meta = {
    inherit (pnpm_12.meta) description homepage license;
    mainProgram = "pnpm";
    platforms = builtins.attrNames sources;
  };
}
