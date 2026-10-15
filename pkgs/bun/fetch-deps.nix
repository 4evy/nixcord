{
  lib,
  stdenvNoCC,
  bun,
  cacert,
  writableTmpDirAsHomeHook,
}:
{
  name,
  src,
  hash,
  patches ? [ ],
  postPatch ? "",
}:
stdenvNoCC.mkDerivation {
  inherit
    name
    src
    patches
    postPatch
    ;
  nativeBuildInputs = [
    bun
    writableTmpDirAsHomeHook
  ];
  dontConfigure = true;
  dontFixup = true;
  SSL_CERT_FILE = "${cacert}/etc/ssl/certs/ca-bundle.crt";
  buildPhase = ''
    runHook preBuild
    bun install --frozen-lockfile --ignore-scripts --linker hoisted --no-progress \
      --cpu '*' --os '*' --cache-dir "$out"
    runHook postBuild
  '';
  installPhase = ''
    runHook preInstall
    # Registry manifests contain timestamps and are unnecessary for frozen installs
    find "$out" -type f -name '*.npm' -delete
    rm --recursive --force "$out/.tmp"
    while IFS= read -r -d "" link; do
      target=$(readlink "$link")
      case "$target" in
        "$out"/*) ln --symbolic --relative --force --no-target-directory "$target" "$link" ;;
      esac
    done < <(find "$out" -type l -print0)
    runHook postInstall
  '';
  outputHashMode = "recursive";
  outputHashAlgo = "sha256";
  outputHash = hash;
  impureEnvVars = lib.fetchers.proxyImpureEnvVars;
}
