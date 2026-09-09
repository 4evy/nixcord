{
  lib,
  stdenvNoCC,
  writeShellApplication,
  jq,
  version,
  configDirName,
  stagedModuleVersions,
  disabledUpdateSettingsJson,
}:
writeShellApplication {
  name = "discord-stage-modules";
  runtimeInputs = [ jq ];
  # ShellCheck runs over the source scripts in CI.  Repeating it in this tiny
  # wrapper's derivation makes every Darwin Discord evaluation pull the full
  # ShellCheck/GHC dependency graph into the evaluator.
  checkPhase = ''
    ${stdenvNoCC.shellDryRun} "$target"
  '';
  runtimeEnv = {
    DISCORD_STAGE_PLATFORM = if stdenvNoCC.hostPlatform.isDarwin then "darwin" else "linux";
    DISCORD_CONFIG_DIR_NAME = configDirName;
    DISCORD_VERSION = version;
    DISCORD_STAGED_MODULES = lib.strings.concatStringsSep " " (
      lib.attrsets.attrNames stagedModuleVersions
    );
    DISCORD_DISABLED_UPDATE_SETTINGS_JSON = disabledUpdateSettingsJson;
    DISCORD_INSTALLED_MODULES_JSON = builtins.toJSON (
      lib.attrsets.mapAttrs (_: moduleVersion: { installedVersion = moduleVersion; }) stagedModuleVersions
    );
  };
  text = ''
    # shellcheck disable=SC1091
    source ${../scripts/stage-modules.sh} "$@"
  '';
}
