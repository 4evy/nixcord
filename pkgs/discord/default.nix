{
  stdenvNoCC,
  stdenv,
  fetchurl,
  lib,
  discord,
  discord-ptb ? null,
  discord-canary ? null,
  discord-development ? null,
  writeShellApplication,
  cacert,
  jq,
  brotli,
  python3,
  runCommand,
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
    if builtins.isAttrs basePackageOverride then
      basePackageOverride.__functionArgs or { }
    else if lib.trivial.isFunction basePackageOverride then
      lib.trivial.functionArgs basePackageOverride
    else
      { };
  basePackageSupportsFHSEnv = basePackageOverrideArgs ? useFHSEnv;
  enabledDiscordModsCount = lib.lists.count lib.trivial.id [
    withVencord
    withEquicord
  ];

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

  commandLineArgsString =
    if builtins.isList commandLineArgs then
      lib.strings.escapeShellArgs commandLineArgs
    else
      commandLineArgs;
  commandLineArgsList = if builtins.isList commandLineArgs then commandLineArgs else [ ];

  indexedCommandLineArgs = lib.lists.imap0 (index: arg: {
    inherit index arg;
  }) commandLineArgsList;
  commandLineArgDeclarations = lib.strings.concatMapStringsSep "\n" (
    { index, arg }:
    "static char command_line_arg_${toString index}[] = \"${lib.strings.escapeC (lib.strings.stringToCharacters arg) arg}\";"
  ) indexedCommandLineArgs;
  commandLineArgPointers = lib.strings.concatMapStringsSep ", " (
    { index, ... }: "command_line_arg_${toString index}"
  ) indexedCommandLineArgs;
  commandLineArgPointersWithComma = lib.strings.optionalString (
    commandLineArgPointers != ""
  ) "${commandLineArgPointers},";

  krispRuntimePath =
    if stdenvNoCC.hostPlatform.isLinux then
      "require('path').join(process.env.DISCORD_USER_DATA_DIR || process.env.XDG_CONFIG_HOME || require('path').join(require('os').homedir(), '.config'), '${configDirName}', '${version}', 'modules', 'discord_krisp')"
    else
      "require('path').join(process.env.DISCORD_USER_DATA_DIR || require('path').join(require('os').userInfo().homedir, 'Library', 'Application Support'), '${configDirName}', '${version}', 'modules', 'discord_krisp')";

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
  // lib.attrsets.optionalAttrs (openasar != null) { inherit openasar; }
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
  enabledDiscordModsCount <= 1
) "nixcord Discord: Vencord and Equicord cannot both be enabled";
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
          ${lib.meta.getExe oldPassthru.disableBreakingUpdates} \
          ${lib.meta.getExe stageModules} \
          "${modulesDir}" \
          ${lib.strings.escapeShellArg (lib.strings.optionalString hasDeployKrisp (lib.meta.getExe deployKrisp))} \
          "$out/Applications/${binaryName}.app/Contents/MacOS/${binaryName}.unwrapped" \
          ${if hasDeployKrisp then "1" else "0"} \
          ${lib.strings.escapeShellArg commandLineArgDeclarations} \
          ${lib.strings.escapeShellArg commandLineArgPointersWithComma} \
          ${toString (builtins.length commandLineArgsList)} \
          ${stdenv.cc}/bin/cc \
          ${lib.meta.getExe rcodesign} \
          ${darwinEntitlements}
      '';
  }
  // lib.attrsets.optionalAttrs stdenvNoCC.hostPlatform.isLinux {
    # nixpkgs interpolates this attribute into its non-FHS launcher. Keep Krisp
    # as the deployer's writable copy while staging the other pinned modules.
    stageModules = lib.meta.getExe stageModules;
  }
)
