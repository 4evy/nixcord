{
  lib,
  python3,
  asar,
  patchStockUpdater,
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
  ${python3.interpreter} - "${resourcesDir}/build_info.json" <<'PY'
  import json
  import sys
  from pathlib import Path

  path = Path(sys.argv[1])
  data = json.loads(path.read_text())
  data["disableUpdater"] = True
  path.write_text(json.dumps(data) + "\n")
  PY
''
+ lib.strings.optionalString (!withOpenASAR) ''
  host_asar="${resourcesDir}/${if mod != null then "_app.asar" else "app.asar"}"
  ${lib.meta.getExe asar} extract "$host_asar" nixcord-host-asar
  ${lib.meta.getExe patchStockUpdater} nixcord-host-asar/bundle.js
  rm "$host_asar"
  ${lib.meta.getExe asar} pack nixcord-host-asar "$host_asar"
  rm -r nixcord-host-asar
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
