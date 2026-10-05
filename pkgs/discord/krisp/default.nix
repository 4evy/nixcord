{
  lib,
  stdenvNoCC,
  brotli,
  python314,
  runCommand,
  darwin ? null,
  withKrisp,
  version,
  configDirName,
  krispSrc,
  replaceVarsWith,
}:
let
  hasKrispSrc = withKrisp && krispSrc != null;
  krispPlatform = if stdenvNoCC.hostPlatform.isDarwin then "darwin" else "linux";
  krispPython = python314.withPackages (ps: [
    ps.lief
    ps.capstone
  ]);
  deployPython = python314.withPackages (ps: [ ps.watchdog ]);

  patchKrispPy = ./patch/binary.py;
  patchKrispModulePy = ./patch/module.py;
  patchVoiceKrispPy = ./patch/voice.py;
  deployKrispPy = ./deploy.py;

  # Bypass Discord's signature check and ad-hoc sign the Darwin module with
  # nixpkgs' signingUtils
  krispModule =
    if hasKrispSrc then
      runCommand "discord-krisp-module"
        (
          {
            nativeBuildInputs = [
              brotli
              krispPython
            ];
          }
          // lib.attrsets.optionalAttrs stdenvNoCC.hostPlatform.isDarwin {
            DARWIN_SIGNING_UTILS = darwin.signingUtils;
          }
        )
        ''
          bash ${./build.sh} \
            ${krispSrc} \
            ${patchKrispPy} \
            ${patchKrispModulePy} \
            ${krispPlatform}
        ''
    else
      null;

  # Deploy a writable copy before launch and repair updater overwrites
  deployKrisp =
    if hasKrispSrc then
      replaceVarsWith {
        src = deployKrispPy;
        name = "deploy-krisp.py";
        dir = "bin";
        isExecutable = true;
        replacements = {
          krispPath = "${krispModule}";
          discordVersion = version;
          inherit configDirName;
        };
        postBuild = ''
          substituteInPlace "$target" \
            --replace-fail '#!/usr/bin/env python3.14' '#!${deployPython.interpreter}'
        '';
        meta.mainProgram = "deploy-krisp.py";
      }
    else
      null;
in
{
  inherit patchVoiceKrispPy krispModule deployKrisp;
}
