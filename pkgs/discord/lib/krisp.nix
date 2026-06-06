{
  lib,
  stdenvNoCC,
  brotli,
  python3,
  runCommand,
  darwin ? null,
  withKrisp,
  version,
  binaryName,
  krispSrc,
  installDeployKrispScript,
  patchKrispModuleScript,
}:
let
  hasKrispSrc = withKrisp && krispSrc != null;
  supportsKrisp = stdenvNoCC.isLinux || stdenvNoCC.isDarwin;
  krispPlatform = if stdenvNoCC.isDarwin then "darwin" else "linux";
  krispPython = python3.withPackages (ps: [
    ps.lief
    ps.capstone
  ]);

  patchKrispPy = ../patches/krisp/patch-krisp.py;
  patchKrispModulePy = ../patches/krisp/patch-krisp-module.py;
  patchVoiceKrispPy = ../patches/krisp/patch-voice-krisp.py;
  deployKrispPy = ../patches/krisp/deploy-krisp.py;

  # Patch the native module to bypass Discord's signature check. Darwin uses
  # nixpkgs' signingUtils so the patched module is ad-hoc signed with the
  # Nix-provided Darwin signing tool.
  krispModule =
    if hasKrispSrc then
      runCommand "discord-krisp-module"
        (
          {
            nativeBuildInputs = [ brotli ] ++ lib.optional supportsKrisp krispPython;
          }
          // lib.optionalAttrs stdenvNoCC.isDarwin { DARWIN_SIGNING_UTILS = darwin.signingUtils; }
        )
        ''
          bash ${patchKrispModuleScript} \
            ${krispSrc} \
            ${patchKrispPy} \
            ${patchKrispModulePy} \
            ${krispPlatform}
        ''
    else
      null;

  # Runtime deployer: copies the patched Krisp module into Discord's config dir
  # before Discord starts and watches for the module updater overwriting it.
  # The watcher matters on Linux too: Discord/OpenASAR can touch native modules
  # during startup, and Krisp must remain a real writable copy, not a store link.
  deployKrisp =
    if hasKrispSrc && supportsKrisp then
      runCommand "deploy-krisp.py"
        {
          pythonInterpreter = "${python3.withPackages (ps: [ ps.watchdog ])}/bin/python3";
          krispPath = "${krispModule}";
          discordVersion = version;
          configDirName = lib.toLower binaryName;
          meta.mainProgram = "deploy-krisp.py";
        }
        ''
          source ${installDeployKrispScript} ${deployKrispPy}
        ''
    else
      null;
in
{
  inherit patchVoiceKrispPy krispModule deployKrisp;
}
