{
  lib,
  stdenvNoCC,
  fetchurl,
  makeWrapper,
  pnpm_12,
}:
let
  version = "12.8.1";
  sources = {
    x86_64-linux = {
      platform = "linux-x64-musl";
      hash = "f0a2db13d0a1b63c0053a5ddcfbf5c454b040e7ef54ca8771750e2cb55b86693";
    };
    aarch64-linux = {
      platform = "linux-arm64-musl";
      hash = "27ad77bdf5368c1747f46fff0d0ee213ed6185aaf69e13342964f5f7cc3f8714";
    };
    aarch64-darwin = {
      platform = "darwin-arm64";
      hash = "8eeeae4cd714b2f1755750d303f5b1bcfe23d95ed7245536305d0c3877c5ce41";
    };
    x86_64-darwin = {
      platform = "darwin-x64";
      hash = "8cbc5a840b4bcd8c0da878e6616a832d88e98a8acbedf1736310b395467f4a13";
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
