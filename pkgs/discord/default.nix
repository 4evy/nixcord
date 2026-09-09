{
  stdenvNoCC,
  stdenv,
  fetchurl,
  fetchzip,
  lib,
  discord,
  discord-ptb ? null,
  discord-canary ? null,
  discord-development ? null,
  writeShellApplication,
  writeText,
  cacert,
  jq,
  brotli,
  python3,
  runCommand,
  asar,
  nodejs,
  darwin ? null,
  rcodesign ? null,

  # Options
  branch ? "stable",
  withVencord ? false,
  vencord ? null,
  withEquicord ? false,
  equicord ? null,
  withOpenASAR ? false,
  openasar ? null,
  commandLineArgs ? [ ],
  withKrisp ? false,
  # Darwin base directory; Discord appends its branch name. Null resolves at
  # launch to $HOME/Library/Application Support/nixcord.
  appDataDir ? null,
  modDataDir ? null,
}:
let
  variantPackages = {
    stable = discord;
    ptb = discord-ptb;
    canary = discord-canary;
    development = discord-development;
  };

  basePackage = variantPackages.${branch} or null;
  basePackageOverride = if basePackage != null then basePackage.override or null else null;
  basePackageOverrideArgs =
    if lib.trivial.isFunction basePackageOverride then
      lib.trivial.functionArgs basePackageOverride
    else
      { };
  basePackageSupportsFHSEnv = basePackageOverrideArgs ? useFHSEnv;
  binaryName =
    if stdenvNoCC.hostPlatform.isLinux then
      {
        stable = "Discord";
        ptb = "DiscordPTB";
        canary = "DiscordCanary";
        development = "DiscordDevelopment";
      }
      .${branch}
    else
      {
        stable = "Discord";
        ptb = "Discord PTB";
        canary = "Discord Canary";
        development = "Discord Development";
      }
      .${branch};

  configDirName =
    if stdenvNoCC.hostPlatform.isDarwin then
      lib.strings.replaceString " " "" (lib.strings.toLower binaryName)
    else
      lib.strings.toLower binaryName;

  modulesDir =
    if stdenvNoCC.hostPlatform.isLinux then
      "$out/opt/${binaryName}/modules"
    else
      "$out/Applications/${binaryName}.app/Contents/Resources/modules";

  resourcesDir =
    if stdenvNoCC.hostPlatform.isLinux then
      "$out/opt/${binaryName}/resources"
    else
      "$out/Applications/${binaryName}.app/Contents/Resources";

  # TypeScript 7 has no compatible compiler API. Use the latest 6.x API for
  # the patcher, independently of the repository's native tsc CLI.
  typescript = fetchzip {
    name = "typescript-6.0.3";
    url = "https://registry.npmjs.org/typescript/-/typescript-6.0.3.tgz";
    hash = "sha256-3+cPVJRyySKkVrRsOld6ShMzHwOP7UFFy0mrq3ZoBKA=";
  };
  patchUpdater = "${lib.meta.getExe nodejs} ${./scripts/patch-updater.cts} ${typescript}/lib/typescript.js";

  sourceSet = import ./lib/sources.nix {
    inherit
      lib
      stdenvNoCC
      fetchurl
      branch
      withKrisp
      ;
  };

  inherit (sourceSet)
    source
    version
    moduleSrcs
    moduleVersions
    krispSrc
    ;

  updateScript = import ./lib/update-script.nix {
    inherit
      writeShellApplication
      cacert
      python3
      ;
    updateSourcesPy = ./scripts/update-sources.py;
  };

  krisp = import ./lib/krisp.nix {
    inherit
      lib
      stdenvNoCC
      brotli
      python3
      runCommand
      darwin
      withKrisp
      version
      binaryName
      krispSrc
      ;
    installDeployKrispScript = ./scripts/install-deploy-krisp.sh;
    patchKrispModuleScript = ./scripts/patch-krisp-module.sh;
  };

  inherit (krisp)
    krispModule
    deployKrisp
    patchVoiceKrispPy
    ;

  hasKrispModule = withKrisp && krispModule != null;
  hasDeployKrisp = withKrisp && deployKrisp != null;

  stagedModuleVersions =
    if hasKrispModule then
      moduleVersions
    else
      lib.attrsets.removeAttrs moduleVersions [ "discord_krisp" ];

  disabledUpdateSettingsJson = builtins.toJSON {
    SKIP_HOST_UPDATE = true;
    SKIP_MODULE_UPDATE = true;
    USE_NEW_UPDATER = false;
  };

  stageModules = import ./lib/stage-modules.nix {
    inherit
      lib
      stdenvNoCC
      writeShellApplication
      jq
      version
      configDirName
      stagedModuleVersions
      disabledUpdateSettingsJson
      ;
  };

  prepareData = writeShellApplication {
    name = "discord-prepare-data";
    text = ''
      exec ${python3.interpreter} ${./scripts/migrate-darwin-profile.py} \
        "$HOME/Library/Application Support/${configDirName}" \
        "''${DISCORD_USER_DATA_DIR:?}/${configDirName}"
    '';
  };

  commandLineArgsString =
    if builtins.isList commandLineArgs then
      lib.strings.escapeShellArgs commandLineArgs
    else
      commandLineArgs;
  commandLineArgsList = if builtins.isList commandLineArgs then commandLineArgs else [ ];
  appDataDirString = lib.trivial.defaultTo "" appDataDir;
  appDataDirFile = writeText "nixcord-app-data-dir" appDataDirString;
  modDataDirString = lib.trivial.defaultTo "" modDataDir;
  modDataDirFile = writeText "nixcord-mod-data-dir" modDataDirString;

  # Embed bytes directly: escapeC only supports printable ASCII.
  commandLineArgsC = lib.strings.concatMapStrings (arg: ''
    (char[]){
    #embed "${writeText "nixcord-command-line-argument" arg}" suffix(,)
      0
    },
  '') commandLineArgsList;

  krispRuntimePath =
    if stdenvNoCC.hostPlatform.isLinux then
      "require('path').join(process.env.DISCORD_USER_DATA_DIR || process.env.XDG_CONFIG_HOME || require('path').join(require('os').homedir(), '.config'), '${configDirName}', '${version}', 'modules', 'discord_krisp')"
    else
      "require('path').join(process.env.DISCORD_USER_DATA_DIR || require('path').join(require('os').userInfo().homedir, 'Library', 'Application Support'), '${configDirName}', '${version}', 'modules', 'discord_krisp')";

  pinnedOpenasar = openasar.overrideAttrs (old: {
    postPatch = (old.postPatch or "") + ''
      # Match stock Discord: the environment names the base, not one branch's
      # profile. Staging, Krisp, and the declarative settings use that contract.
      substituteInPlace src/paths.js \
        --replace-fail \
          "process.env.DISCORD_USER_DATA_DIR ?? join(app.getPath('appData'), appDir)" \
          "join(process.env.DISCORD_USER_DATA_DIR ?? app.getPath('appData'), appDir)"
      substituteInPlace src/bootstrap.js \
        --replace-fail \
          "if (Constants.USE_NEW_UPDATER && updater.tryInitUpdater(" \
          "if (!buildInfo.disableUpdater && Constants.USE_NEW_UPDATER && updater.tryInitUpdater("
      ${patchUpdater} openasar src/updater/moduleUpdater.js
    '';
  });

  overrideArgs = {
    inherit
      source
      withVencord
      withEquicord
      withOpenASAR
      ;
    commandLineArgs = if stdenvNoCC.hostPlatform.isDarwin then "" else commandLineArgsString;
  }
  // lib.attrsets.optionalAttrs (vencord != null) { inherit vencord; }
  // lib.attrsets.optionalAttrs (equicord != null) { inherit equicord; }
  // lib.attrsets.optionalAttrs (openasar != null) {
    openasar = if withOpenASAR then pinnedOpenasar else openasar;
  }
  // lib.attrsets.optionalAttrs (stdenvNoCC.hostPlatform.isLinux && basePackageSupportsFHSEnv) {
    # Keep nixcord's patched, non-FHS package even when nixpkgs defaults to an
    # FHS wrapper for unmodified Krisp.
    useFHSEnv = false;
  };

  package = basePackage.override overrideArgs;

  darwinEntitlements = builtins.toFile "discord-entitlements.plist" (
    lib.generators.toPlist { escape = true; } {
      "com.apple.security.cs.allow-jit" = true;
      "com.apple.security.cs.allow-unsigned-executable-memory" = true;
      "com.apple.security.cs.disable-library-validation" = true;
      "com.apple.security.device.audio-input" = true;
      "com.apple.security.device.camera" = true;
    }
  );
in
assert lib.asserts.assertMsg (
  basePackage != null
) "nixcord Discord: branch '${branch}' is unavailable on this platform";
assert lib.asserts.assertMsg (
  !(withVencord && withEquicord)
) "nixcord Discord: Vencord and Equicord cannot both be enabled";
assert lib.asserts.assertMsg (
  appDataDir == null || (stdenvNoCC.hostPlatform.isDarwin && lib.strings.hasPrefix "/" appDataDir)
) "nixcord Discord: appDataDir must be an absolute Darwin path";
assert lib.asserts.assertMsg (
  modDataDir == null || (stdenvNoCC.hostPlatform.isDarwin && lib.strings.hasPrefix "/" modDataDir)
) "nixcord Discord: modDataDir must be an absolute Darwin path";
assert lib.asserts.assertMsg (
  !withOpenASAR || openasar != null
) "nixcord Discord: OpenASAR requires an openasar package for updater and data directory patching";
package.overrideAttrs (
  oldAttrs:
  let
    oldPassthru = oldAttrs.passthru or { };
  in
  {
    passthru = oldPassthru // {
      inherit
        updateScript
        source
        moduleSrcs
        moduleVersions
        ;
      nixcordCommandLineArgsList = true;
      nixcordUsesFHSEnv = false;
      nixcordKrispPatch = hasKrispModule;
    };

    postInstall =
      (oldAttrs.postInstall or "")
      + ''
        # Current Discord ignores USE_NEW_UPDATER in settings.json. Keep both
        # Linux and Darwin on the legacy loader with Nix-staged modules. On
        # Darwin, downloaded unpatched Krisp also rejects our ad-hoc signature.
        ${python3.interpreter} - "${resourcesDir}/build_info.json" <<'PY'
        import json
        import sys
        from pathlib import Path

        path = Path(sys.argv[1])
        data = json.loads(path.read_text())
        data["disableUpdater"] = True
        path.write_text(json.dumps(data) + "\n")
        PY
      ''
      + lib.strings.optionalString (!withOpenASAR) ''
        host_asar="${resourcesDir}/${if withVencord || withEquicord then "_app.asar" else "app.asar"}"
        ${lib.meta.getExe asar} extract "$host_asar" nixcord-host-asar
        ${patchUpdater} stock nixcord-host-asar/bundle.js
        rm "$host_asar"
        ${lib.meta.getExe asar} pack nixcord-host-asar "$host_asar"
        rm -r nixcord-host-asar
      ''
      + lib.strings.optionalString hasKrispModule ''
        rm -rf "${modulesDir}/discord_krisp"
        mkdir -p "${modulesDir}/discord_krisp"
        cp -R "${krispModule}/." "${modulesDir}/discord_krisp/"
        chmod -R u+w "${modulesDir}/discord_krisp"

        ${python3.interpreter} ${patchVoiceKrispPy} \
          "${modulesDir}/discord_voice/index.js" \
          ${lib.strings.escapeShellArg krispRuntimePath}
      '';

    postFixup =
      (oldAttrs.postFixup or "")
      + lib.strings.optionalString (stdenvNoCC.hostPlatform.isLinux && hasDeployKrisp) ''
        wrapProgramShell "$out/opt/${binaryName}/${binaryName}" \
          --run ${lib.strings.escapeShellArg (lib.meta.getExe deployKrisp)}
      ''
      + lib.strings.optionalString stdenvNoCC.hostPlatform.isDarwin ''
        source ${./scripts/install-darwin-launcher.sh} \
          ${lib.strings.escapeShellArg binaryName} \
          ${./src/discord-launcher.c} \
          ${lib.meta.getExe prepareData} \
          ${lib.meta.getExe stageModules} \
          "${modulesDir}" \
          ${lib.strings.escapeShellArg (lib.strings.optionalString hasDeployKrisp (lib.meta.getExe deployKrisp))} \
          "$out/Applications/${binaryName}.app/Contents/MacOS/${binaryName}.unwrapped" \
          ${if hasDeployKrisp then "1" else "0"} \
          ${lib.strings.escapeShellArg commandLineArgsC} \
          ${stdenv.cc}/bin/cc \
          ${lib.meta.getExe rcodesign} \
          ${darwinEntitlements} \
          ${appDataDirFile} \
          ${modDataDirFile} \
          ${
            lib.strings.escapeShellArg (
              if withEquicord then
                "EQUICORD_USER_DATA_DIR"
              else if withVencord then
                "VENCORD_USER_DATA_DIR"
              else
                ""
            )
          } \
          ${lib.strings.escapeShellArg "/Library/Application Support/${
            if withEquicord then "Equicord" else "Vencord"
          }"}
      '';
  }
  // lib.attrsets.optionalAttrs stdenvNoCC.hostPlatform.isLinux {
    # nixpkgs interpolates this attribute into its non-FHS launcher. Keep Krisp
    # as the deployer's writable copy while staging the other pinned modules.
    stageModules = lib.meta.getExe stageModules;
  }
)
