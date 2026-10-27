{
  lib,
  stdenvNoCC,
  stdenv,
  callPackage,
  nodejs,
  writableTmpDirAsHomeHook,
  autoPatchelfHook,
  zlib,
}:
args:
let
  bun = callPackage ../../nix/bun/bun.nix { };
  incompatibleLibc = if stdenvNoCC.hostPlatform.isMusl then "gnu" else "musl";
in
stdenvNoCC.mkDerivation (
  args
  // {
    strictDeps = true;
    nativeBuildInputs =
      (args.nativeBuildInputs or [ ])
      ++ [
        bun
        nodejs
        writableTmpDirAsHomeHook
      ]
      ++ lib.optional stdenvNoCC.hostPlatform.isLinux autoPatchelfHook;
    buildInputs =
      (args.buildInputs or [ ])
      ++ lib.optionals stdenvNoCC.hostPlatform.isLinux [
        stdenv.cc.cc.lib
        zlib
      ];
    configurePhase = ''
      runHook preConfigure
      export BUN_INSTALL_CACHE_DIR="$TMPDIR/bun-cache"
      cp --recursive "${args.bunDeps}" "$BUN_INSTALL_CACHE_DIR"
      chmod --recursive u+w "$BUN_INSTALL_CACHE_DIR"
      bun install --offline --frozen-lockfile --ignore-scripts --linker hoisted
      ${lib.optionalString stdenvNoCC.hostPlatform.isLinux ''
        # Bun installs both libc variants; discard binaries for the other libc
        find node_modules -type f -name '*-${incompatibleLibc}.node' -delete
        find node_modules -depth -type d -name '*-${incompatibleLibc}' -exec rm --recursive --force {} \;
        autoPatchelf node_modules
      ''}
      patchShebangs --build node_modules
      runHook postConfigure
    '';
  }
)
