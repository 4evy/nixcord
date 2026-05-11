{
  stdenvNoCC,
  lib,
  nodejs,
  bun,
  writableTmpDirAsHomeHook,
  vencord,
  equicord,
  nix,
  vencordSource ? vencord.src,
  equicordSource ? equicord.src,
  skipGitMigrations ? true,
}:
let
  nodeModulesHashDarwin = "sha256-HrntzBT2zJ6njNlvWPIYIzjKiH85Xfry/KezWmQwMNs=";
  nodeModulesHashLinux = "sha256-CpKWMgGkk3W64mZ7EFWfaW0A3kPEaT2jcn62+iJYQPM=";
  nodeModulesHash = if stdenvNoCC.hostPlatform.isDarwin then nodeModulesHashDarwin else nodeModulesHashLinux;
in
stdenvNoCC.mkDerivation (finalAttrs: {
  name = "nixcord-plugin-options";
  version = "generated";

  src = lib.fileset.toSource {
    root = ../.;
    fileset = lib.fileset.unions [
      ../package.json
      ../bun.lock
      ../tsconfig.base.json
      ../vitest.workspace.ts
      ../vitest.projects.ts
      ../vite.config.shared.ts
      ../modules/plugins/deprecated.nix
      ../modules/plugins/deprecated.json
      ../packages
    ];
  };

  node_modules = stdenvNoCC.mkDerivation {
    pname = "nixcord-node_modules";
    inherit (finalAttrs) version src;

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

      bun install \
        --frozen-lockfile \
        --ignore-scripts \
        --no-progress

      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall

      mkdir -p $out
      find . -type d -name node_modules -exec cp -R --parents {} $out \;

      runHook postInstall
    '';

    dontFixup = true;

    outputHash = nodeModulesHash;
    outputHashAlgo = "sha256";
    outputHashMode = "recursive";
  };

  nativeBuildInputs = [
    bun
    nodejs
    nix
    writableTmpDirAsHomeHook
  ];

  configurePhase = ''
    runHook preConfigure

    cp -R ${finalAttrs.node_modules}/. .

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
    ./node_modules/.bin/vitest run
    runHook postCheck
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p "$out/plugins"
    cp modules/plugins/deprecated.nix "$out/plugins/deprecated.nix"
    cp modules/plugins/deprecated.json "$out/plugins/deprecated.json"

    ${lib.getExe nodejs} packages/cli/dist/index.js \
      --vencord "${vencordSource}" \
      --vencord-plugins src/plugins \
      --equicord "${equicordSource}" \
      --equicord-plugins src/equicordplugins \
      --output "$out/dummy.nix" \
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

    runHook postInstallCheck
  '';
})
