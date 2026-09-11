{
  lib,
  stdenvNoCC,
  bun,
  writableTmpDirAsHomeHook,
  src,
  version,
}:
let
  hashes = {
    x86_64-linux = "sha256-0z0oB0rVE9IlZ+yypsX/RGP/9VJbkmlJJnL/f1rG8/o=";
    aarch64-linux = "sha256-R5R78c80/aHKw2Dpk/RoxUFaHmUoN3xP7IwKUUu3aMU=";
    aarch64-darwin = "sha256-93F2Z6gXQ8ORodcPRxdC1e0IGha7d9P+bo8Dl182LWo=";
  };
  hash =
    hashes.${stdenvNoCC.hostPlatform.system}
      or (throw "Unsupported system: ${stdenvNoCC.hostPlatform.system}");
  bunCPU = if stdenvNoCC.hostPlatform.isAarch64 then "arm64" else "x64";
  bunOS = if stdenvNoCC.hostPlatform.isDarwin then "darwin" else "linux";
in
stdenvNoCC.mkDerivation {
  pname = "nixcord-node_modules";
  inherit version src;

  __structuredAttrs = true;
  strictDeps = true;

  impureEnvVars = lib.fetchers.proxyImpureEnvVars ++ [
    "GIT_PROXY_COMMAND"
    "SOCKS_SERVER"
  ];

  nativeBuildInputs = [
    bun
    writableTmpDirAsHomeHook
  ];

  dontConfigure = true;

  buildPhase = ''
    runHook preBuild

    export BUN_INSTALL_CACHE_DIR="$(mktemp -d)"
    # The generator uses root tooling and packages/*, but never the docs site.
    bun install \
      --filter './' \
      --filter './packages/*' \
      --frozen-lockfile \
      --ignore-scripts \
      --backend=copyfile \
      --linker=isolated \
      --os=${bunOS} \
      --cpu=${bunCPU} \
      --no-progress

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p "$out"
    cp -R --parents node_modules packages/*/node_modules "$out"

    runHook postInstall
  '';

  # Keep fixed-output hashes independent of Nix store paths. Shebangs are
  # patched after the dependency tree is copied into the main derivation.
  dontFixup = true;

  outputHash = hash;
  outputHashAlgo = "sha256";
  outputHashMode = "recursive";

  meta.platforms = builtins.attrNames hashes;
}
