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
  curl,
  jq,
  nix,
  asar,
  openasar ? null,
  brotli,
  libpulseaudio,
  # Krisp noise cancellation patching
  python3,
  runCommand,
  darwin ? null,
  rcodesign,

  # Options
  branch ? "stable",
  withVencord ? false,
  vencord ? null,
  withEquicord ? false,
  equicord ? null,
  withOpenASAR ? false,
  commandLineArgs ? [ ],
  withKrisp ? false,
}:
let
  launcherCFlags = [
    "-std=c23"
    "-Wall"
    "-Wextra"
    "-Wpedantic"
    "-Wconversion"
    "-Wsign-conversion"
    "-Wcast-qual"
    "-Wwrite-strings"
    "-Wformat=2"
    "-Wshadow"
    "-Wstrict-prototypes"
    "-Wmissing-prototypes"
    "-Wold-style-definition"
    "-Wundef"
    "-Wvla"
    "-Walloca"
    "-Werror"
  ];

  withoutOpenSSL11 = lib.filter (input: !(lib.hasPrefix "openssl-1.1.1" (lib.getName input)));

  binaryName =
    if stdenvNoCC.isLinux then
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
    if stdenvNoCC.isDarwin then
      lib.replaceStrings [ " " ] [ "" ] (lib.toLower binaryName)
    else
      lib.toLower binaryName;

  nodeModulesTargetPrefix = if stdenvNoCC.isLinux then "../../modules" else "../modules";

  resourcesDir =
    if stdenvNoCC.isLinux then
      "$out/opt/${binaryName}/resources"
    else
      "$out/Applications/${binaryName}.app/Contents/Resources";

  scripts = {
    deleteLargeBadges = ./scripts/delete-large-badges.sh;
    extractDistro = ./scripts/extract-distro.sh;
    installDarwinDistro = ./scripts/install-darwin-distro.sh;
    installDarwinLauncher = ./scripts/install-darwin-launcher.sh;
    installOpenASAR = ./scripts/install-openasar.sh;
    installPatcherASAR = ./scripts/install-patcher-asar.sh;
    linkNodeModules = ./scripts/link-node-modules.sh;
    restoreDarwinSymlinks = ./scripts/restore-darwin-symlinks.py;
    setLocalModulesRoot = ./scripts/set-local-modules-root.py;
    unpackDistroModules = ./scripts/unpack-distro-modules.sh;
    wrapLinuxDiscord = ./scripts/wrap-linux-discord.sh;
  };

  discordLib = lib.makeScope lib.callPackageWith (self: {
    inherit
      lib
      stdenvNoCC
      stdenv
      fetchurl
      discord
      discord-ptb
      discord-canary
      discord-development
      writeShellApplication
      cacert
      curl
      jq
      nix
      asar
      openasar
      brotli
      libpulseaudio
      python3
      runCommand
      darwin
      rcodesign
      branch
      withVencord
      vencord
      withEquicord
      equicord
      withOpenASAR
      commandLineArgs
      withKrisp
      launcherCFlags
      withoutOpenSSL11
      binaryName
      configDirName
      nodeModulesTargetPrefix
      resourcesDir
      scripts
      ;

    sourceSet = self.callPackage ./lib/sources.nix { };

    inherit (self.sourceSet)
      source
      version
      src
      moduleSrcs
      moduleVersions
      krispSrc
      stagedModuleSrcs
      stagedModuleVersions
      ;

    krisp = self.callPackage ./lib/krisp.nix {
      installDeployKrispScript = ./scripts/install-deploy-krisp.sh;
      patchKrispModuleScript = ./scripts/patch-krisp-module.sh;
    };

    inherit (self.krisp)
      krispModule
      deployKrisp
      patchVoiceKrispPy
      ;

    disabledUpdateSettings = {
      SKIP_HOST_UPDATE = true;
      SKIP_MODULE_UPDATE = true;
      USE_NEW_UPDATER = false;
    };

    disabledUpdateSettingsJson = builtins.toJSON self.disabledUpdateSettings;

    updateScript = self.callPackage ./lib/update-script.nix {
      updateSourcesPy = ./scripts/update-sources.py;
    };

    stageModules = self.callPackage ./lib/stage-modules.nix { };

    basePackage = self.callPackage ./lib/base-package.nix { };

    darwinEntitlements = builtins.toFile "discord-entitlements.plist" (
      lib.generators.toPlist { escape = true; } {
        "com.apple.security.cs.allow-jit" = true;
        "com.apple.security.cs.allow-unsigned-executable-memory" = true;
        "com.apple.security.cs.disable-library-validation" = true;
        "com.apple.security.device.audio-input" = true;
        "com.apple.security.device.camera" = true;
      }
    );

    package = self.callPackage ./lib/override.nix {
      launcherC = ./src/discord-launcher.c;
    };
  });
in
discordLib.package
