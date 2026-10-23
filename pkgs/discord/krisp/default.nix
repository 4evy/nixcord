{
  lib,
  stdenvNoCC,
  brotli,
  callPackage,
  python314,
  replaceVarsWith,
  runCommand,
  darwin ? null,
  withKrisp,
  version,
  configDirName,
  krispSrc,
}:
let
  hasKrispSrc = withKrisp && krispSrc != null;
  krispPython = python314.withPackages (ps: [
    ps.lief
    ps.capstone
  ]);
  deployPython = python314.withPackages (ps: [ ps.watchdog ]);
  javascript = callPackage ../patching/krisp { };
  patchVoiceKrisp = javascript.voice;

  # Bypass Discord's signature check and ad-hoc sign the Darwin module with
  # nixpkgs' signingUtils
  krispModule =
    if hasKrispSrc then
      runCommand "discord-krisp-module"
        {
          nativeBuildInputs = [
            brotli
            javascript.index
          ];
        }
        ''
          mkdir --parents "$out"
          brotli --decompress < ${krispSrc} | tar --extract --file=- --strip-components=1 --directory "$out"
          ${krispPython.interpreter} ${./patch/binary.py} "$out/discord_krisp.node"
          patch-krisp-index "$out/index.js"
          ${lib.strings.optionalString stdenvNoCC.hostPlatform.isDarwin ''
            source ${darwin.signingUtils}
            sign "$out/discord_krisp.node"
          ''}
        ''
    else
      null;

  # Deploy a writable copy before launch and repair updater overwrites
  deployKrisp =
    if hasKrispSrc then
      replaceVarsWith {
        src = ./deploy.py;
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
  inherit patchVoiceKrisp krispModule deployKrisp;
}
