{
  lib,
  goofcord,
  stdenv,
  buildNpmPackage,
  fetchFromGitHub,
  autoPatchelfHook,
  callPackage,
  patch,
  makeBinaryWrapper,
  makeShellWrapper,
  copyDesktopItems,
  rcodesign,
  writeShellApplication,
  nix,
  nix-update,
}:
let
  nodejs = callPackage ../../nix/nodejs.nix { };
  npmDepsVersion = "2.3.0";
  src = fetchFromGitHub {
    owner = "Milkshiift";
    repo = "GoofCord";
    tag = "v${npmDepsVersion}";
    hash = "sha256-cg9NVL/dPIQ9xyMrUmWd42HxEsTSnhUGiqB7qaU2LuQ=";
  };
  npmDepsHash = "sha256-U5PWC8koQ5LIeRZs/8ZrkyeRXHdxtjIZvxCxW//y788=";
  nodeBuildPatch = ./node-build.patch;

  nodeModules = buildNpmPackage {
    pname = "goofcord-modules";
    version = npmDepsVersion;
    inherit src;
    inherit nodejs npmDepsHash;
    patches = [ nodeBuildPatch ];
    postPatch = "cp ${./package-lock.json} package-lock.json";
    # arrpc still declares a TypeScript 5 peer.
    npmInstallFlags = [
      "--ignore-scripts"
      "--allow-remote=root"
      "--legacy-peer-deps"
      "--force"
    ];
    npmRebuildFlags = [ "--ignore-scripts" ];
    dontNpmBuild = true;
    installPhase = ''
      runHook preInstall
      cp -R node_modules "$out"
      runHook postInstall
    '';
  };

  updateScript = writeShellApplication {
    name = "update-goofcord";
    runtimeInputs = [
      nix
      nix-update
      nodejs
      patch
    ];
    text = ''
      root="$PWD"
      nix-update --flake --src-only \
        --override-filename pkgs/goofcord/default.nix goofcord
      source=$(nix build --no-link --print-out-paths .#goofcord.src)
      work=$(mktemp -d)
      trap 'rm -rf -- "$work"' EXIT
      cp -R "$source/." "$work/"
      chmod -R u+w "$work"
      cd -P "$work"
      patch -p1 < "$root/pkgs/goofcord/node-build.patch"
      cp "$root/pkgs/goofcord/package-lock.json" package-lock.json
      npm install --package-lock-only --ignore-scripts --allow-remote=root --legacy-peer-deps --force
      cp package-lock.json "$root/pkgs/goofcord/package-lock.json"
      cd "$root"
      nix-update --flake --version=skip --no-src \
        --override-filename pkgs/goofcord/default.nix goofcord.npmDeps
    '';
  };
in
goofcord.overrideAttrs (
  old:
  {
    version = npmDepsVersion;
    inherit src;
    patches = (old.patches or [ ]) ++ [ nodeBuildPatch ];
    node-modules = nodeModules;
    env = builtins.removeAttrs (old.env or { }) [
      "GOOFCORD_PATCHCORD_PATH"
      "GOOFCORD_VENBIND_PATH"
    ];
    nativeBuildInputs =
      builtins.filter (
        input:
        !(builtins.elem (input.pname or "") [
          "bun"
          "nodejs"
        ])
      ) (old.nativeBuildInputs or [ ])
      ++ [ nodejs ]
      ++ lib.optional stdenv.hostPlatform.isLinux autoPatchelfHook;
    configurePhase = ''
      runHook preConfigure
      cp -R ${nodeModules} node_modules
      chmod -R u+w node_modules
      patchShebangs --build node_modules
      runHook postConfigure
    '';
    buildPhase = builtins.replaceStrings [ "bun run build" ] [ "npm run build" ] old.buildPhase;
    meta = (old.meta or { }) // {
      platforms = lib.platforms.linux ++ [ "aarch64-darwin" ];
    };

    passthru = (old.passthru or { }) // {
      inherit updateScript;
      npmDeps = nodeModules.npmDeps;
    };
  }
  // lib.attrsets.optionalAttrs stdenv.hostPlatform.isDarwin {
    nativeBuildInputs =
      lib.lists.subtractLists
        [
          copyDesktopItems
          makeShellWrapper
        ]
        (
          builtins.filter (
            input:
            !(builtins.elem (input.pname or "") [
              "bun"
              "nodejs"
            ])
          ) (old.nativeBuildInputs or [ ])
        )
      ++ [
        nodejs
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
        --entitlements-xml-file ${src}/build/entitlements.mac.plist \
        --code-signature-flags 'Contents/Frameworks/GoofCord Helper.app:runtime' \
        --entitlements-xml-file 'Contents/Frameworks/GoofCord Helper.app:${src}/build/entitlements.mac.plist' \
        --code-signature-flags 'Contents/Frameworks/GoofCord Helper (Renderer).app:runtime' \
        --entitlements-xml-file 'Contents/Frameworks/GoofCord Helper (Renderer).app:${src}/build/entitlements.mac.plist' \
        --code-signature-flags 'Contents/Frameworks/GoofCord Helper (GPU).app:runtime' \
        --entitlements-xml-file 'Contents/Frameworks/GoofCord Helper (GPU).app:${src}/build/entitlements.mac.plist' \
        --code-signature-flags 'Contents/Frameworks/GoofCord Helper (Plugin).app:runtime' \
        --entitlements-xml-file 'Contents/Frameworks/GoofCord Helper (Plugin).app:${src}/build/entitlements.mac.plist' \
        "$out/Applications/GoofCord.app"
    '';
  }
)
