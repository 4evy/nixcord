{
  lib,
  callPackage,
  brotli,
  cctools,
  darwin,
  ffmpeg_7-headless,
  python3,
  writeText,
  rcodesign,
  binaryName,
  layout,
  moduleSrcs,
  commandLineArgs,
  hasDeployKrisp,
  deployKrisp,
  appDataDir,
  modDataDir,
  mod,
}:
finalAttrs:
let
  fixDistroSymlinks = directory: ''
    # Restore Discord's mode-000 symlinks without following their targets
    find "$out/${directory}" -type l -exec chmod --no-dereference 777 {} +
  '';
  unpackDistro = src: directory: ''
    mkdir --parents "$out/${directory}"
    brotli --decompress < ${src} > discord-distro.tar
    tar --extract --file=discord-distro.tar --strip-components=1 --directory="$out/${directory}"
    ${fixDistroSymlinks directory}
    rm discord-distro.tar
  '';

  commandLineArgsList = if builtins.isList commandLineArgs then commandLineArgs else [ ];
  darwinSigningPython = python3.withPackages (ps: [ ps.pyyaml ]);
  launcher = callPackage ./launcher {
    configuration = {
      directories = [
        {
          name = "DISCORD_USER_DATA_DIR";
          configured = appDataDir;
          suffix = "Library/Application Support/nixcord";
        }
      ]
      ++ lib.optional (mod != null) {
        name = mod.dataDirEnv;
        configured = modDataDir;
        suffix = lib.removePrefix "/" mod.dataDirSuffix;
      };
      stage_modules = finalAttrs.stageModules;
      deploy_krisp = if hasDeployKrisp then lib.getExe deployKrisp else null;
      command_line_args = commandLineArgsList;
      modules_dir = "../Resources/modules";
      target = "${binaryName}.unwrapped";
    };
  };
in
{
  nativeBuildInputs = [ brotli ] ++ lib.optionals (moduleSrcs ? discord_ndi) [ cctools ];
  dontStrip = true;

  installPhase = ''
    runHook preInstall

    ${unpackDistro finalAttrs.src (builtins.dirOf layout.appDir)}
    ${lib.strings.concatMapAttrsStringSep "\n" (
      name: src: unpackDistro src "${layout.modulesDir}/${name}"
    ) moduleSrcs}

    # Finder and the CLI enter the native launcher installed during fixup
    mkdir --parents "$out/bin"
    ln --symbolic "$out/${layout.executable}" "$out/bin/${binaryName}"

    runHook postInstall
  '';

  postInstall =
    lib.optionalString (moduleSrcs ? discord_ndi) ''
      # NDI dlopens the FFmpeg 7 ABI by dylib name rather than linking it
      install_name_tool -add_rpath "${ffmpeg_7-headless.lib}/lib" \
        "$out/${layout.modulesDir}/discord_ndi/libndi.dylib"
      source ${darwin.signingUtils}
      sign "$out/${layout.modulesDir}/discord_ndi/libndi.dylib"
    ''
    + ''
      # Redirect module data APIs without changing native code or signatures
      ${lib.strings.concatMapStringsSep "\n"
        (module: ''
          cat ${
            writeText "${module}-redirect.js" (
              "\n"
              + ''
                require('${./modules/redirect.cjs}')(module.exports, '${module}');
              ''
            )
          } >> "$out/${layout.modulesDir}/${module}/index.js"
        '')
        [
          "discord_intents"
          "discord_notifications"
        ]
      }
    '';

  postFixup = ''
    mv "$out/${layout.executable}" "$out/${layout.executable}.unwrapped"
    install --mode=755 ${lib.getExe launcher} "$out/${layout.executable}"
    ${darwinSigningPython.interpreter} ${./launcher/signing.py} \
      ${lib.meta.getExe rcodesign} "$out/${layout.appDir}" ${lib.strings.escapeShellArg binaryName}
  '';
}
