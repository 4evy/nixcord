{
  stdenvNoCC,
  lib,
  callPackage,
  nodejs,
  bun,
  writableTmpDirAsHomeHook,
  nix,
  vencordSource ? "node_modules/vencord",
  equicordSource ? "node_modules/equicord",
  skipGitMigrations ? true,
}:
let
  sources = import ./generate-options/sources.nix { inherit lib; };
in
stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "nixcord-plugin-options";
  version = "generated";

  __structuredAttrs = true;
  strictDeps = true;

  src = sources.project;

  node_modules = callPackage ./generate-options/node-modules.nix {
    inherit (finalAttrs) version;
    src = sources.dependencies;
  };

  nativeBuildInputs = [
    bun
    nodejs
    writableTmpDirAsHomeHook
  ];

  nativeInstallCheckInputs = [ nix ];

  configurePhase = ''
    runHook preConfigure

    cp -R ${finalAttrs.node_modules}/. .
    chmod -R u+w node_modules packages/*/node_modules
    patchShebangs --build node_modules packages/*/node_modules

    runHook postConfigure
  '';

  buildPhase = ''
    runHook preBuild
    bun run --filter '@nixcord/shared' build
    bun run --filter '@nixcord/git-analyzer' build
    bun run --filter '@nixcord/ast' build
    bun run --filter '@nixcord/nix-generator' build
    bun run --filter '@nixcord/parser' build
    bun run --filter '@nixcord/cli' build
    runHook postBuild
  '';

  doCheck = true;

  checkPhase = ''
    runHook preCheck
    ./node_modules/.bin/vitest run \
      --exclude 'packages/parser/tests/validation/**' \
      --no-isolate \
      --experimental.fsModuleCache \
      --maxWorkers=1 \
      --testTimeout=30000
    ./node_modules/.bin/vitest run \
      packages/parser/tests/validation/real-world.test.ts \
      --no-isolate \
      --experimental.fsModuleCache \
      --maxWorkers=1 \
      --testTimeout=30000
    runHook postCheck
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p "$out/plugins"
    cp modules/plugins/deprecated.json "$out/plugins/deprecated.json"
    cp modules/plugins/migrations.nix "$out/plugins/migrations.nix"

    ${lib.getExe nodejs} packages/cli/dist/index.js \
      --vencord "${vencordSource}" \
      --vencord-plugins src/plugins \
      --equicord "${equicordSource}" \
      --equicord-plugins src/equicordplugins \
      --output "$out/dummy.nix" \
      --overrides modules/plugins/overrides.json \
      ${lib.optionalString skipGitMigrations "--skip-git-migrations"} \
      --verbose

    runHook postInstall
  '';

  doInstallCheck = true;

  installCheckPhase = ''
    runHook preInstallCheck

    export NIX_STATE_DIR="$TMPDIR/nix-state"
    mkdir -p "$NIX_STATE_DIR"

    for nixFile in "$out/plugins"/*.nix; do
      if ! nix-instantiate --parse "$nixFile" > /dev/null 2>&1; then
        echo "ERROR: Invalid Nix syntax in $nixFile"
        nix-instantiate --parse "$nixFile" 2>&1 || true
        exit 1
      fi
    done

    for jsonFile in "$out/plugins"/*.json; do
      ${lib.getExe nodejs} -e \
        'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))' \
        "$jsonFile"
    done

    runHook postInstallCheck
  '';

  meta = {
    description = "Generate nixcord Vencord and Equicord plugin option files";
    homepage = "https://github.com/4evy/nixcord";
    license = lib.licenses.mit;
    inherit (finalAttrs.node_modules.meta) platforms;
  };
})
