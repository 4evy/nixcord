{
  lib,
  goofcord,
  stdenv,
  bun,
  nodejs_24,
  writableTmpDirAsHomeHook,
  makeBinaryWrapper,
  makeShellWrapper,
  copyDesktopItems,
  rcodesign,
  writeShellApplication,
  bash,
  coreutils,
  gitMinimal,
  gnugrep,
  gnused,
  nix,
  perl,
}:
let
  darwinDeps = {
    version = "2.2.1";

    hashes = {
      aarch64-darwin = "sha256-9X8c7+Sy/dLkGOF1T71hoeU8XsvaaS7wk3jmHAcqKIA=";
    };
  };

  nodeModules = stdenv.mkDerivation {
    inherit (goofcord) version src;
    pname = "${goofcord.pname}-modules";

    impureEnvVars = lib.fetchers.proxyImpureEnvVars ++ [
      "GIT_PROXY_COMMAND"
      "SOCKS_SERVER"
    ];

    nativeBuildInputs = [
      bun
      nodejs_24
      writableTmpDirAsHomeHook
    ];

    dontConfigure = true;
    dontFixup = true;

    buildPhase = ''
      runHook preBuild

      export BUN_INSTALL_CACHE_DIR="$(mktemp -d)"
      export npm_config_build_from_source=true
      export ELECTRON_SKIP_BINARY_DOWNLOAD=1

      bun install \
        --frozen-lockfile \
        --ignore-scripts \
        --linker=hoisted \
        --no-progress

      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall
      cp -R node_modules "$out"
      runHook postInstall
    '';

    outputHash =
      if goofcord.version != darwinDeps.version then
        throw "GoofCord ${goofcord.version} does not match the Darwin dependency snapshot for ${darwinDeps.version}; run `nix run .#update-goofcord` on aarch64-darwin"
      else
        darwinDeps.hashes.${stdenv.hostPlatform.system}
          or (throw "Unsupported GoofCord Darwin platform: ${stdenv.hostPlatform.system}");
    outputHashAlgo = "sha256";
    outputHashMode = "recursive";

    meta.platforms = [ "aarch64-darwin" ];
  };

  updateScript = writeShellApplication {
    name = "update-goofcord";
    runtimeInputs = [
      bash
      coreutils
      gitMinimal
      gnugrep
      gnused
      nix
      perl
    ];
    text = ''
      exec bash ${./scripts/update-goofcord-darwin-deps.sh} "$@"
    '';
  };
in
goofcord.overrideAttrs (
  old:
  {
    meta = (old.meta or { }) // {
      platforms = lib.platforms.linux ++ [ "aarch64-darwin" ];
    };

    passthru = (old.passthru or { }) // {
      inherit updateScript;
    };
  }
  // lib.attrsets.optionalAttrs stdenv.hostPlatform.isDarwin (
    {
      nativeBuildInputs =
        lib.lists.subtractLists [
          copyDesktopItems
          makeShellWrapper
        ] (old.nativeBuildInputs or [ ])
        ++ [
          makeBinaryWrapper
          rcodesign
        ];

      desktopItems = [ ];

      env =
        lib.attrsets.removeAttrs (old.env or { }) [
          "GOOFCORD_PATCHCORD_PATH"
          "GOOFCORD_VENBIND_PATH"
        ]
        // {
          CSC_IDENTITY_AUTO_DISCOVERY = "false";
        };

      postPatch = (old.postPatch or "") + ''
        # Disable code signing on macOS, as nixpkgs does for other Electron clients.
        substituteInPlace electron-builder.ts \
          --replace-fail 'identity: "",' 'identity: null,'
      '';

      installPhase = ''
        runHook preInstall

        mkdir -p "$out/Applications" "$out/bin"
        mv dist/mac*/GoofCord.app "$out/Applications/GoofCord.app"
        makeWrapper \
          "$out/Applications/GoofCord.app/Contents/MacOS/GoofCord" \
          "$out/bin/goofcord"

        runHook postInstall
      '';

      # Seal the complete Electron app after fixup so nested frameworks and
      # resources form one valid ad-hoc-signed bundle.
      postFixup = (old.postFixup or "") + ''
        ${lib.meta.getExe rcodesign} sign \
          --code-signature-flags runtime \
          --entitlements-xml-file ${goofcord.src}/build/entitlements.mac.plist \
          --code-signature-flags 'Contents/Frameworks/GoofCord Helper.app:runtime' \
          --entitlements-xml-file 'Contents/Frameworks/GoofCord Helper.app:${goofcord.src}/build/entitlements.mac.plist' \
          --code-signature-flags 'Contents/Frameworks/GoofCord Helper (Renderer).app:runtime' \
          --entitlements-xml-file 'Contents/Frameworks/GoofCord Helper (Renderer).app:${goofcord.src}/build/entitlements.mac.plist' \
          --code-signature-flags 'Contents/Frameworks/GoofCord Helper (GPU).app:runtime' \
          --entitlements-xml-file 'Contents/Frameworks/GoofCord Helper (GPU).app:${goofcord.src}/build/entitlements.mac.plist' \
          --code-signature-flags 'Contents/Frameworks/GoofCord Helper (Plugin).app:runtime' \
          --entitlements-xml-file 'Contents/Frameworks/GoofCord Helper (Plugin).app:${goofcord.src}/build/entitlements.mac.plist' \
          "$out/Applications/GoofCord.app"
      '';
    }
    // lib.attrsets.optionalAttrs (old ? node-modules) {
      node-modules = nodeModules;
    }
  )
)
