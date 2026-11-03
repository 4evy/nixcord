{
  callPackage,
  git,
}:
{
  pname,
  version,
  src,
  bunLock,
  bunDepsHash,
  patches ? [ ],
  buildWebExtension ? false,
  browserDir ? "dist",
  env,
  meta,
}:
let
  buildBunPackage = callPackage ../bun/build-package.nix { };
  postPatch = ''
    cp ${bunLock} bun.lock
    bun ${./prepare-package.ts}
    substituteInPlace package.json \
      --replace-fail 'node ' 'bun ' \
      --replace-fail 'pnpm ' 'bun run --bun '
    # Extension assembly and browser consumers copy bundles without sidecars
    # Keep dependency notices in the distributed JavaScript instead
    substituteInPlace scripts/build/common.mjs \
      --replace-fail 'legalComments: "linked"' 'legalComments: "eof"'
  '';
in
buildBunPackage {
  inherit
    pname
    version
    src
    patches
    postPatch
    env
    meta
    ;
  bunDeps = (callPackage ../bun/fetch-deps.nix { }) {
    name = "${pname}-bun-deps";
    inherit src patches postPatch;
    hash = bunDepsHash;
  };
  nativeBuildInputs = [ git ];
  buildPhase = ''
    runHook preBuild
    bun run --bun ${if buildWebExtension then "buildWeb" else "build"} \
      --standalone --disable-updater
    runHook postBuild
  '';
  installPhase = ''
    runHook preInstall
    cp --recursive ${if buildWebExtension then "${browserDir}/chromium-unpacked" else "dist"} "$out"
    cp package.json "$out/"
    runHook postInstall
  '';
  passthru.updateScript = callPackage ../bun/update-script.nix { } {
    attrPath = pname;
    extraArgs = [ "--version=branch=main" ];
    prepareLockfile = ''
      bun ${./prepare-package.ts}
    '';
  };
}
