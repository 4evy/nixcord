{
  lib,
  stdenvNoCC,
  fetchurl,
  makeWrapper,
  pnpm_12,
}:
let
  version = "12.9.1";
  sources = {
    x86_64-linux = {
      platform = "linux-x64-musl";
      hash = "7c52e6db59c9cd3837ae1ec0b96ab3209d3c42cb0e3a77f5db8cbe86661d85a6";
    };
    aarch64-linux = {
      platform = "linux-arm64-musl";
      hash = "11de22634b9eb543d2f6ae9ccbc728274fb9a7ee81ee1bc7e5e45bec876ebca8";
    };
    aarch64-darwin = {
      platform = "darwin-arm64";
      hash = "4dcea94654bc8f2189dfd591aea7af4adddd29243e4bfcc8d4c8b4289e7983ba";
    };
    x86_64-darwin = {
      platform = "darwin-x64";
      hash = "e8b47f538f95167c57fdeacffc9cb3af82261217f31eb764151aaf500b76f1b3";
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
