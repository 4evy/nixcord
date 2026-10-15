{
  lib,
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
  env,
  meta,
}:
let
  buildBunPackage = callPackage ../bun/build-package.nix { };
  postPatch = ''
    cp ${bunLock} bun.lock
    substituteInPlace package.json \
      --replace-fail 'link:packages/discord-types' 'file:packages/discord-types' \
      --replace-fail 'node ' 'bun ' \
      --replace-fail 'pnpm ' 'bun run --bun '
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
    cp --recursive dist/${lib.optionalString buildWebExtension "chromium-unpacked/"} "$out"
    cp package.json "$out/"
    runHook postInstall
  '';
  passthru.updateScript = callPackage ../bun/update-script.nix { } {
    attrPath = pname;
    extraArgs = [ "--version=branch=main" ];
    prepareLockfile = ''
      jq '.devDependencies["@vencord/discord-types"] = "file:packages/discord-types"' \
        package.json > package.json.tmp
      mv package.json.tmp package.json
    '';
  };
}
