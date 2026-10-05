{
  lib,
  python3,
  asar,
  patchStockUpdater,
  patchLauncher ? null,
  launcherPath ? null,
  resourcesDir,
  modulesDir,
  withOpenASAR,
  openasar,
  mod,
  hasKrispModule,
  krispModule,
  patchVoiceKrispPy,
  krispRuntimePath,
}:
assert (patchLauncher == null) == (launcherPath == null);
lib.strings.optionalString withOpenASAR ''
  cp -f ${openasar} "${resourcesDir}/app.asar"
''
+ lib.strings.optionalString (mod != null) ''
  mv "${resourcesDir}/app.asar" "${resourcesDir}/_app.asar"
  mkdir "${resourcesDir}/app.asar"
  echo '{"name":"discord","main":"index.js"}' > "${resourcesDir}/app.asar/package.json"
  printf '%s\n' ${lib.escapeShellArg "require(${builtins.toJSON mod.patcher})"} > "${resourcesDir}/app.asar/index.js"
''
+ ''
  # Keep the legacy loader on Nix-staged modules on both platforms
  ${python3.interpreter} - "${resourcesDir}/build_info.json" ${
    lib.optionalString (launcherPath != null) ''"${launcherPath}"''
  } <<'PY'
  import json
  import sys
  from pathlib import Path

  path = Path(sys.argv[1])
  data = json.loads(path.read_text())
  data["disableUpdater"] = True
  ${lib.optionalString (launcherPath != null) ''data["nixcordLauncher"] = sys.argv[2]''}
  path.write_text(json.dumps(data) + "\n")
  PY
''
+ lib.strings.optionalString (!withOpenASAR) ''
  host_asar="${resourcesDir}/${if mod != null then "_app.asar" else "app.asar"}"
  ${lib.meta.getExe asar} extract "$host_asar" nixcord-host-asar
  ${lib.meta.getExe patchStockUpdater} nixcord-host-asar/bundle.js
  ${lib.optionalString (patchLauncher != null) ''
    ${lib.getExe patchLauncher} host nixcord-host-asar/bundle.js "${launcherPath}"
  ''}
  rm "$host_asar"
  ${lib.meta.getExe asar} pack nixcord-host-asar "$host_asar"
  rm -r nixcord-host-asar
''
# Desktop core owns renderer-requested relaunches even with an OpenASAR host
# The launcher restages modules; explicit argv retains wrapper and user flags
+ lib.optionalString (patchLauncher != null) ''
  core_asar="${modulesDir}/discord_desktop_core/core.asar"
  ${lib.getExe asar} extract "$core_asar" nixcord-core-asar
  ${lib.getExe patchLauncher} core nixcord-core-asar/bundle.js "${launcherPath}"
  rm "$core_asar"
  ${lib.getExe asar} pack nixcord-core-asar "$core_asar"
  rm -r nixcord-core-asar
''
+ lib.strings.optionalString hasKrispModule ''
  rm -rf "${modulesDir}/discord_krisp"
  mkdir -p "${modulesDir}/discord_krisp"
  cp -R "${krispModule}/." "${modulesDir}/discord_krisp/"
  chmod -R u+w "${modulesDir}/discord_krisp"

  ${python3.interpreter} ${patchVoiceKrispPy} \
    "${modulesDir}/discord_voice/index.js" \
    ${lib.strings.escapeShellArg krispRuntimePath}
''
