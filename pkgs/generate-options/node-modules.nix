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
    x86_64-linux = "sha256-aby3FW257HCyS02ppHhwvcp+H3hf763WtYsF5Rs8zkg=";
    aarch64-linux = "sha256-iXmm9h4Oao0Of8WlYlqh7IZRyL3pxmW+trSlS0by92s=";
    aarch64-darwin = "sha256-r+UGML1BvqFrc21IO1Qn/YYhXA7F+y6sqsAgUkWAMNI=";
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
