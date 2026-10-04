{
  lib,
  stdenv,
  brotli,
  python3,
  writeScript,
  writeText,
  rcodesign,
  common,
  binaryName,
  layout,
  moduleSrcs,
  stageModules,
  commandLineArgs,
  hasDeployKrisp,
  deployKrisp,
  appDataDir,
  modDataDir,
  mod,
}:
let
  fixDistroSymlinks = writeScript "discord-fix-distro-symlinks.py" ''
    #!${python3.interpreter}
    import pathlib
    import sys
    import tarfile

    with tarfile.open(sys.argv[1]) as tar:
        for member in tar:
            if not member.issym():
                continue
            parts = pathlib.PurePosixPath(member.name).parts[1:]
            if not parts:
                continue
            path = pathlib.Path(sys.argv[2], *parts)
            path.unlink(missing_ok=True)
            path.symlink_to(member.linkname)
  '';

  appDataDirFile = writeText "nixcord-app-data-dir" (lib.trivial.defaultTo "" appDataDir);
  modDataDirFile = writeText "nixcord-mod-data-dir" (lib.trivial.defaultTo "" modDataDir);
  commandLineArgsList = if builtins.isList commandLineArgs then commandLineArgs else [ ];

  # Embed bytes directly: escapeC only supports printable ASCII
  commandLineArgsC = lib.strings.concatMapStrings (arg: ''
    (char[]){
    #embed "${writeText "nixcord-command-line-argument" arg}" suffix(,)
      0
    },
  '') commandLineArgsList;

  darwinSigningPython = python3.withPackages (ps: [ ps.pyyaml ]);
in
stdenv.mkDerivation (
  finalAttrs:
  common
  // {
    inherit stageModules;

    nativeBuildInputs = [ brotli ];
    dontStrip = true;

    installPhase = ''
      runHook preInstall

      mkdir -p "$out/${builtins.dirOf layout.appDir}"

      extractDistro() {
        local src="$1"
        local dest="$2"
        local tarball
        tarball=$(mktemp)
        brotli -d < "$src" > "$tarball"
        tar xf "$tarball" --strip-components=1 -C "$dest"

        # Restore Discord's mode-000 symlinks with normal Darwin permissions
        ${fixDistroSymlinks} "$tarball" "$dest"
        rm "$tarball"
      }

      extractDistro "$src" "$out/${builtins.dirOf layout.appDir}"

      ${lib.concatStringsSep "\n" (
        lib.mapAttrsToList (name: src: ''
          mkdir -p "$out/${layout.modulesDir}/${name}"
          extractDistro ${src} "$out/${layout.modulesDir}/${name}"
        '') moduleSrcs
      )}

      # Finder and the CLI enter the native launcher installed during fixup
      mkdir -p "$out/bin"
      ln -s "$out/${layout.executable}" "$out/bin/${binaryName}"

      runHook postInstall
    '';

    postInstall = common.postInstall + ''
      # Redirect module data APIs without changing native code or signatures
      for module in discord_intents discord_notifications; do
        cat >> "$out/${layout.modulesDir}/$module/index.js" <<JS

      require('${./scripts/redirect-module-data.cjs}')(module.exports, '$module');
      JS
      done
    '';

    postFixup = ''
      source ${./scripts/install-darwin-launcher.sh} \
        ${lib.strings.escapeShellArg binaryName} \
        ${./src/discord-launcher.c} \
        ${finalAttrs.stageModules} \
        "$out/${layout.modulesDir}" \
        ${lib.strings.escapeShellArg (lib.strings.optionalString hasDeployKrisp (lib.meta.getExe deployKrisp))} \
        "$out/${layout.executable}.unwrapped" \
        ${if hasDeployKrisp then "1" else "0"} \
        ${lib.strings.escapeShellArg commandLineArgsC} \
        ${stdenv.cc}/bin/cc \
        ${lib.meta.getExe rcodesign} \
        ${darwinSigningPython}/bin/python3 \
        ${./scripts/prepare-darwin-signing.py} \
        ${appDataDirFile} \
        ${modDataDirFile} \
        ${lib.strings.escapeShellArg (if mod == null then "" else mod.dataDirEnv)} \
        ${lib.strings.escapeShellArg (if mod == null then "" else mod.dataDirSuffix)}
    '';
  }
)
