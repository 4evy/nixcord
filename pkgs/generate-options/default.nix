{
  lib,
  bun,
  callPackage,
  git,
  nix,
  nixfmt,
  nix-update-script,
  vencordSource ? "node_modules/vencord",
  equicordSource ? "node_modules/equicord",
  skipGitMigrations ? true,
}:
let
  buildBunPackage = callPackage ../bun/build-package.nix { };
  sources = import ./sources.nix { inherit lib; };
in
buildBunPackage {
  pname = "plugin-options";
  version = "generated";

  __structuredAttrs = true;
  strictDeps = true;

  src = sources.project;

  bunDeps = callPackage ./node-modules.nix { };

  passthru.updateScript = nix-update-script {
    attrPath = "generate";
    extraArgs = [
      "--flake"
      "--version=skip"
      "--no-src"
      "--custom-dep=bunDeps"
      "--override-filename=pkgs/generate-options/node-modules.nix"
    ];
  };

  nativeBuildInputs = [ nixfmt ] ++ lib.optional (!skipGitMigrations) git;

  nativeCheckInputs = [ git ];

  nativeInstallCheckInputs = [ nix ];

  buildPhase = ''
    runHook preBuild
    bun run --bun build:packages
    runHook postBuild
  '';

  doCheck = true;

  checkPhase = ''
    runHook preCheck
    bun node_modules/vitest/vitest.mjs run \
      --exclude 'packages/parser/tests/validation/**' \
      --no-isolate \
      --fsModuleCache \
      --maxWorkers=1 \
      --testTimeout=30000
    bun node_modules/vitest/vitest.mjs run \
      packages/parser/tests/validation/real-world.test.ts \
      --no-isolate \
      --fsModuleCache \
      --maxWorkers=1 \
      --testTimeout=30000
    runHook postCheck
  '';

  installPhase = ''
    runHook preInstall

    mkdir --parents "$out/plugins"
    cp modules/plugins/deprecated.json "$out/plugins/deprecated.json"
    cp modules/plugins/migrations.nix "$out/plugins/migrations.nix"

    ${lib.strings.optionalString (!skipGitMigrations) ''
      git config --global --add safe.directory "${vencordSource}"
      git config --global --add safe.directory "${equicordSource}"
    ''}

    ${lib.meta.getExe bun} packages/cli/dist/index.js \
      --vencord "${vencordSource}" \
      --vencord-plugins src/plugins \
      --equicord "${equicordSource}" \
      --equicord-plugins src/equicordplugins \
      --output "$out/dummy.nix" \
      --overrides modules/plugins/overrides.json \
      ${lib.strings.optionalString skipGitMigrations "--skip-git-migrations"} \
      --verbose

    find "$out/plugins" -type f -name '*.nix' -exec nixfmt {} +

    runHook postInstall
  '';

  doInstallCheck = true;

  installCheckPhase = ''
    runHook preInstallCheck

    export NIX_STATE_DIR="$TMPDIR/nix-state"
    mkdir --parents "$NIX_STATE_DIR"

    for nixFile in "$out/plugins"/*.nix; do
      if ! nix-instantiate --parse "$nixFile" > /dev/null 2>&1; then
        echo "ERROR: Invalid Nix syntax in $nixFile"
        nix-instantiate --parse "$nixFile" 2>&1 || true
        exit 1
      fi
    done

    while IFS= read -r -d "" jsonFile; do
      ${lib.meta.getExe bun} --eval \
        'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))' \
        "$jsonFile"
    done < <(find "$out/plugins" -type f -name '*.json' -print0)

    runHook postInstallCheck
  '';

  meta = {
    description = "Generate Vencord and Equicord plugin option files";
    homepage = "https://github.com/4evy/nixcord";
    license = lib.licenses.mit;
    platforms = lib.platforms.unix;
  };
}
