{
  lib,
  stdenvNoCC,
  writeShellApplication,
  jq,
  version,
  configDirName,
  stagedModuleVersions,
}:
writeShellApplication {
  name = "discord-stage-modules";
  runtimeInputs = [ jq ];
  # CI checks the source scripts; keep ShellCheck and its GHC dependency graph
  # out of Darwin package evaluation
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
    DISCORD_DISABLED_UPDATE_SETTINGS_JSON = builtins.toJSON {
      SKIP_HOST_UPDATE = true;
      SKIP_MODULE_UPDATE = true;
      USE_NEW_UPDATER = false;
    };
    DISCORD_INSTALLED_MODULES_JSON = builtins.toJSON (
      lib.attrsets.mapAttrs (_: moduleVersion: { installedVersion = moduleVersion; }) stagedModuleVersions
    );
  };
  text = ''
    # shellcheck disable=SC1091
    source ${./stage.sh} "$@"
  '';
}
