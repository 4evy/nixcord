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
  text = ''
    ${lib.toShellVars {
      DISCORD_STAGE_PLATFORM = if stdenvNoCC.isDarwin then "darwin" else "linux";
      DISCORD_CONFIG_DIR_NAME = configDirName;
      DISCORD_VERSION = version;
      DISCORD_STAGED_MODULES = lib.concatStringsSep " " (lib.attrNames stagedModuleVersions);
      DISCORD_DISABLED_UPDATE_SETTINGS_JSON = disabledUpdateSettingsJson;
      DISCORD_INSTALLED_MODULES_JSON = builtins.toJSON (
        lib.mapAttrs (_: moduleVersion: { installedVersion = moduleVersion; }) stagedModuleVersions
      );
    }}
    : \
      "''${DISCORD_CONFIG_DIR_NAME}" \
      "''${DISCORD_DISABLED_UPDATE_SETTINGS_JSON}" \
      "''${DISCORD_INSTALLED_MODULES_JSON}" \
      "''${DISCORD_STAGE_PLATFORM}" \
      "''${DISCORD_STAGED_MODULES}" \
      "''${DISCORD_VERSION}"
    # shellcheck disable=SC1091
    source ${../scripts/stage-modules.sh} "$@"
  '';
}
