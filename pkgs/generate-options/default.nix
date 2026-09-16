{
  buildNpmPackage,
  lib,
  callPackage,
  git,
  writableTmpDirAsHomeHook,
  nix,
  vencordSource ? "node_modules/vencord",
  equicordSource ? "node_modules/equicord",
  skipGitMigrations ? true,
}:
let
  nodejs = callPackage ../../nix/nodejs.nix { };
  sources = import ./sources.nix { inherit lib; };
in
buildNpmPackage {
  pname = "nixcord-plugin-options";
  version = "generated";

  __structuredAttrs = true;
  strictDeps = true;

  src = sources.project;

  inherit nodejs;
  npmDeps = callPackage ./node-modules.nix { };
  npmDepsFetcherVersion = 2;
  npmInstallFlags = [ "--ignore-scripts" ];

  nativeBuildInputs = [
    nodejs
    writableTmpDirAsHomeHook
  ]
  ++ lib.lists.optional (!skipGitMigrations) git;

  nativeCheckInputs = [ git ];

  nativeInstallCheckInputs = [ nix ];

  npmBuildScript = "build:packages";

  doCheck = true;

  checkPhase = ''
    runHook preCheck
    ./node_modules/.bin/vitest run \
      --exclude 'packages/parser/tests/validation/**' \
      --no-isolate \
      --fsModuleCache \
      --maxWorkers=1 \
      --testTimeout=30000
    ./node_modules/.bin/vitest run \
      packages/parser/tests/validation/real-world.test.ts \
      --no-isolate \
      --fsModuleCache \
      --maxWorkers=1 \
      --testTimeout=30000
    runHook postCheck
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p "$out/plugins"
    cp modules/plugins/deprecated.json "$out/plugins/deprecated.json"
    cp modules/plugins/migrations.nix "$out/plugins/migrations.nix"

    ${lib.strings.optionalString (!skipGitMigrations) ''
      git config --global --add safe.directory "${vencordSource}"
      git config --global --add safe.directory "${equicordSource}"
    ''}

    ${lib.meta.getExe nodejs} packages/cli/dist/index.js \
      --vencord "${vencordSource}" \
      --vencord-plugins src/plugins \
      --equicord "${equicordSource}" \
      --equicord-plugins src/equicordplugins \
      --output "$out/dummy.nix" \
      --overrides modules/plugins/overrides.json \
      ${lib.strings.optionalString skipGitMigrations "--skip-git-migrations"} \
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
      ${lib.meta.getExe nodejs} -e \
        'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))' \
        "$jsonFile"
    done

    runHook postInstallCheck
  '';

  meta = {
    description = "Generate nixcord Vencord and Equicord plugin option files";
    homepage = "https://github.com/4evy/nixcord";
    license = lib.licenses.mit;
    platforms = lib.platforms.unix;
  };
}
