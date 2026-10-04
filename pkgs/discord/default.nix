{
  stdenvNoCC,
  fetchurl,
  lib,
  callPackage,
  writeShellApplication,
  cacert,
  jq,
  brotli,
  python3,
  runCommand,
  asar,
  darwin ? null,

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
  withTTS ? true,
  enableAutoscroll ? false,
  # Darwin base directory; Discord appends its branch name
  # Null resolves at launch to $HOME/Library/Application Support/nixcord
  appDataDir ? null,
  modDataDir ? null,
}:
let
  metadata = import ./metadata.nix { inherit lib stdenvNoCC branch; };
  inherit (metadata)
    pname
    meta
    binaryName
    desktopName
    configDirName
    layout
    ;

  mods = {
    vencord = {
      enabled = withVencord;
      patcher = "${vencord}/patcher.js";
      dataDirEnv = "VENCORD_USER_DATA_DIR";
      dataDirSuffix = "/Library/Application Support/Vencord";
    };
    equicord = {
      enabled = withEquicord;
      patcher = "${equicord}/desktop/patcher.js";
      dataDirEnv = "EQUICORD_USER_DATA_DIR";
      dataDirSuffix = "/Library/Application Support/Equicord";
    };
  };
  enabledMods = lib.filter (mod: mod.enabled) (builtins.attrValues mods);
  mod = if enabledMods == [ ] then null else builtins.head enabledMods;

  patchStockUpdater = callPackage ./lib/patch-stock-updater.nix { };

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
    inherit writeShellApplication cacert python3;
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
  inherit (krisp) krispModule deployKrisp patchVoiceKrispPy;
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

  krispRuntimePath =
    if stdenvNoCC.hostPlatform.isLinux then
      "require('path').join(process.env.DISCORD_USER_DATA_DIR || process.env.XDG_CONFIG_HOME || require('path').join(require('os').homedir(), '.config'), '${configDirName}', '${version}', 'modules', 'discord_krisp')"
    else
      "require('path').join(process.env.DISCORD_USER_DATA_DIR || require('path').join(require('os').userInfo().homedir, 'Library', 'Application Support'), '${configDirName}', '${version}', 'modules', 'discord_krisp')";

  patchedOpenasar = openasar.overrideAttrs (old: {
    patches = (old.patches or [ ]) ++ [ ./patches/openasar.patch ];
  });

  common = {
    inherit pname version meta;
    src = fetchurl { inherit (source.distro) url hash; };
    dontUnpack = true;
    passthru = {
      inherit
        updateScript
        source
        moduleSrcs
        moduleVersions
        ;
      stageModules = lib.meta.getExe stageModules;
      nixcordCommandLineArgsList = true;
      nixcordKrispPatch = hasKrispModule;
    };
    postInstall = import ./lib/install.nix {
      inherit
        lib
        python3
        asar
        patchStockUpdater
        mod
        withOpenASAR
        hasKrispModule
        krispModule
        patchVoiceKrispPy
        krispRuntimePath
        ;
      openasar = patchedOpenasar;
      resourcesDir = "$out/${layout.resourcesDir}";
      modulesDir = "$out/${layout.modulesDir}";
    };
  };
  platformArgs = {
    inherit
      common
      binaryName
      layout
      moduleSrcs
      commandLineArgs
      hasDeployKrisp
      deployKrisp
      ;
    stageModules = lib.meta.getExe stageModules;
  };
in
assert lib.asserts.assertMsg (lib.meta.availableOn stdenvNoCC.hostPlatform {
  inherit meta;
}) "nixcord Discord: unsupported platform '${stdenvNoCC.hostPlatform.system}'";
assert lib.asserts.assertMsg (
  builtins.length enabledMods <= 1
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
callPackage (if stdenvNoCC.hostPlatform.isLinux then ./linux.nix else ./darwin.nix) (
  platformArgs
  // (
    if stdenvNoCC.hostPlatform.isLinux then
      { inherit desktopName withTTS enableAutoscroll; }
    else
      {
        inherit
          appDataDir
          modDataDir
          mod
          ;
      }
  )
)
