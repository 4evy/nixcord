{
  stdenv,
  fetchurl,
  lib,
  callPackage,

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
  metadata = callPackage ./metadata.nix { inherit branch; };
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

  sourceSet = callPackage ./sources { inherit branch withKrisp; };
  inherit (sourceSet)
    source
    version
    moduleSrcs
    moduleVersions
    krispSrc
    ;

  krisp = callPackage ./krisp {
    inherit
      withKrisp
      version
      configDirName
      krispSrc
      ;
  };
  inherit (krisp) krispModule deployKrisp patchVoiceKrispPy;
  hasKrispModule = withKrisp && krispModule != null;
  hasDeployKrisp = withKrisp && deployKrisp != null;

  stagedModuleVersions =
    if hasKrispModule then
      moduleVersions
    else
      lib.attrsets.removeAttrs moduleVersions [ "discord_krisp" ];
  stageModules = callPackage ./modules {
    inherit version configDirName stagedModuleVersions;
  };

  krispRuntimePath =
    if stdenv.hostPlatform.isLinux then
      "require('path').join(process.env.DISCORD_USER_DATA_DIR || process.env.XDG_CONFIG_HOME || require('path').join(require('os').homedir(), '.config'), '${configDirName}', '${version}', 'modules', 'discord_krisp')"
    else
      "require('path').join(process.env.DISCORD_USER_DATA_DIR || require('path').join(require('os').userInfo().homedir, 'Library', 'Application Support'), '${configDirName}', '${version}', 'modules', 'discord_krisp')";

  patchedOpenasar = openasar.overrideAttrs (old: {
    patches = (old.patches or [ ]) ++ [ ./patching/openasar.patch ];
  });
in
assert lib.asserts.assertMsg (lib.meta.availableOn stdenv.hostPlatform {
  inherit meta;
}) "Discord: unsupported platform '${stdenv.hostPlatform.system}'";
assert lib.asserts.assertMsg (
  builtins.length enabledMods <= 1
) "Discord: Vencord and Equicord cannot both be enabled";
assert lib.asserts.assertMsg (
  appDataDir == null || (stdenv.hostPlatform.isDarwin && lib.strings.hasPrefix "/" appDataDir)
) "Discord: appDataDir must be an absolute Darwin path";
assert lib.asserts.assertMsg (
  modDataDir == null || (stdenv.hostPlatform.isDarwin && lib.strings.hasPrefix "/" modDataDir)
) "Discord: modDataDir must be an absolute Darwin path";
assert lib.asserts.assertMsg (
  !withOpenASAR || openasar != null
) "Discord: OpenASAR requires an openasar package for updater and data directory patching";
stdenv.mkDerivation (
  finalAttrs:
  let
    platformBuilder =
      callPackage (if stdenv.hostPlatform.isLinux then ./platforms/linux else ./platforms/darwin)
        (
          {
            inherit
              binaryName
              layout
              moduleSrcs
              commandLineArgs
              hasDeployKrisp
              deployKrisp
              ;
          }
          // (
            if stdenv.hostPlatform.isLinux then
              { inherit desktopName withTTS enableAutoscroll; }
            else
              { inherit appDataDir modDataDir mod; }
          )
        );
    platformAttrs = platformBuilder finalAttrs;
  in
  platformAttrs
  // {
    inherit pname version meta;
    src = fetchurl { inherit (source.distro) url hash; };
    dontUnpack = true;
    stageModules = lib.getExe stageModules;

    postInstall =
      callPackage ./install.nix {
        inherit
          mod
          withOpenASAR
          hasKrispModule
          krispModule
          patchVoiceKrispPy
          krispRuntimePath
          ;
        patchStockUpdater = callPackage ./patching/updater { };
        patchLauncher = callPackage ./patching/launcher { };
        launcherPath = "$out/${layout.executable}";
        openasar = patchedOpenasar;
        resourcesDir = "$out/${layout.resourcesDir}";
        modulesDir = "$out/${layout.modulesDir}";
      }
      + (platformAttrs.postInstall or "");

    passthru = {
      inherit source moduleSrcs moduleVersions;
      updateScript = callPackage ./sources/update { };
      stageModules = finalAttrs.stageModules;
      commandLineArgsAsList = true;
      krispPatched = hasKrispModule;
    };
  }
)
