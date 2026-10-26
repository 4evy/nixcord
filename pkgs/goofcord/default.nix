{
  lib,
  goofcord,
  stdenv,
  fetchFromGitHub,
  autoPatchelfHook,
  libx11,
  libxtst,
  callPackage,
  makeBinaryWrapper,
  makeShellWrapper,
  copyDesktopItems,
  rcodesign,
}:
let
  buildBunPackage = callPackage ../bun/build-package.nix { };
  version = "2.3.1";
  src = fetchFromGitHub {
    owner = "Milkshiift";
    repo = "GoofCord";
    tag = "v${version}";
    hash = "sha256-958TIiBsXYTfYaQdNKeVJspdSE1vIYMX/wScfqekTBU=";
  };
  bunDepsHash = "sha256-VYCPrQ1N8kGbsV2uD5UzrcczBCgangU+bHj9wDh8eSs=";
  dependencyPatch = ./dependencies.patch;

  nodeModules = buildBunPackage {
    pname = "goofcord-modules";
    inherit version src;
    patches = [ dependencyPatch ];
    postPatch = "cp ${./bun.lock} bun.lock";
    bunDeps = (callPackage ../bun/fetch-deps.nix { }) {
      name = "goofcord-bun-deps";
      inherit src;
      patches = [ dependencyPatch ];
      postPatch = "cp ${./bun.lock} bun.lock";
      hash = bunDepsHash;
    };
    buildInputs = lib.optionals stdenv.hostPlatform.isLinux [
      libx11
      libxtst
    ];
    dontBuild = true;
    installPhase = ''
      runHook preInstall
      cp --recursive node_modules "$out"
      runHook postInstall
    '';
  };

  updateScript = callPackage ../bun/update-script.nix { } {
    attrPath = "goofcord";
  };
in
goofcord.overrideAttrs (
  old:
  let
    env = builtins.removeAttrs (old.env or { }) [
      "GOOFCORD_PATCHCORD_PATH"
      "GOOFCORD_VENBIND_PATH"
    ];
  in
  {
    inherit version src;
    patches = (old.patches or [ ]) ++ [ dependencyPatch ];
    node-modules = nodeModules;
    env =
      env
      // lib.attrsets.optionalAttrs stdenv.hostPlatform.isDarwin {
        CSC_IDENTITY_AUTO_DISCOVERY = "false";
      };
    nativeBuildInputs =
      lib.lists.subtractLists (lib.lists.optionals stdenv.hostPlatform.isDarwin [
        copyDesktopItems
        makeShellWrapper
      ]) (old.nativeBuildInputs or [ ])
      ++ lib.lists.optional stdenv.hostPlatform.isLinux autoPatchelfHook
      ++ lib.lists.optionals stdenv.hostPlatform.isDarwin [
        makeBinaryWrapper
        rcodesign
      ];
    configurePhase = ''
      runHook preConfigure
      cp --recursive ${nodeModules} node_modules
      chmod --recursive u+w node_modules
      patchShebangs --build node_modules
      runHook postConfigure
    '';
    buildPhase =
      builtins.replaceStrings
        [
          "bun run build -- --skipTypecheck"
          "node node_modules/electron-builder/out/cli/cli.js"
          "-c.npmRebuild=false"
        ]
        [
          "bun run --bun build --skipTypecheck"
          "bun --bun node_modules/electron-builder/cli.js"
          "--config.nativeModules.npmRebuild=false"
        ]
        old.buildPhase;
    meta = (old.meta or { }) // {
      platforms = lib.platforms.linux ++ [ "aarch64-darwin" ];
    };

    passthru = (old.passthru or { }) // {
      inherit updateScript;
      bunDeps = nodeModules.bunDeps;
    };
  }
  // lib.attrsets.optionalAttrs stdenv.hostPlatform.isDarwin {
    desktopItems = [ ];

    postPatch = (old.postPatch or "") + ''
      # Disable code signing on macOS, as nixpkgs does for other Electron clients
      substituteInPlace electron-builder.ts \
        --replace-fail 'identity: "",' 'identity: null,'
    '';

    installPhase = ''
      runHook preInstall

      mkdir --parents "$out/Applications" "$out/bin"
      mv dist/mac*/GoofCord.app "$out/Applications/GoofCord.app"
      makeWrapper \
        "$out/Applications/GoofCord.app/Contents/MacOS/GoofCord" \
        "$out/bin/goofcord"

      runHook postInstall
    '';

    # Seal the complete Electron app after fixup so nested frameworks and
    # resources form one valid ad-hoc-signed bundle
    postFixup = (old.postFixup or "") + ''
      ${lib.meta.getExe rcodesign} sign \
        --code-signature-flags runtime \
        --entitlements-xml-file ${src}/build/entitlements.mac.plist \
        ${
          lib.strings.escapeShellArgs (
            lib.lists.concatMap
              (
                suffix:
                let
                  helper = "Contents/Frameworks/GoofCord Helper${suffix}.app";
                in
                [
                  "--code-signature-flags"
                  "${helper}:runtime"
                  "--entitlements-xml-file"
                  "${helper}:${src}/build/entitlements.mac.plist"
                ]
              )
              [
                ""
                " (Renderer)"
                " (GPU)"
                " (Plugin)"
              ]
          )
        } \
        "$out/Applications/GoofCord.app"
    '';
  }
)
