{
  lib,
  stdenvNoCC,
  branch ? "stable",
}:
let
  branches = {
    stable = "Discord";
    ptb = "Discord PTB";
    canary = "Discord Canary";
    development = "Discord Development";
  };
  desktopName = branches.${branch};
  isLinux = stdenvNoCC.hostPlatform.isLinux;
  binaryName = if isLinux then lib.strings.replaceString " " "" desktopName else desktopName;
in
assert lib.asserts.assertMsg (builtins.hasAttr branch branches)
  "Discord: branch '${branch}' is unavailable on this platform";
{
  inherit binaryName desktopName;
  pname = if branch == "stable" then "discord" else "discord-${branch}";
  configDirName = lib.strings.toLower (lib.strings.replaceString " " "" desktopName);
  # Paths are relative to $out for shared installers and platform launchers
  # Linux modules sit beside resources; Darwin modules live inside resources
  layout =
    let
      appDir = if isLinux then "opt/${binaryName}" else "Applications/${desktopName}.app";
      resourcesDir = if isLinux then "${appDir}/resources" else "${appDir}/Contents/Resources";
    in
    {
      inherit appDir resourcesDir;
      modulesDir = if isLinux then "${appDir}/modules" else "${resourcesDir}/modules";
      executable =
        if isLinux then "${appDir}/${binaryName}" else "${appDir}/Contents/MacOS/${binaryName}";
    };
  meta = {
    description = "All-in-one cross-platform voice and text chat for gamers";
    homepage = "https://discord.com/";
    downloadPage = "https://discord.com/download";
    license = lib.licenses.unfree;
    mainProgram = binaryName;
    maintainers = [ lib.maintainers._4evy ];
    platforms = [
      "x86_64-linux"
      "aarch64-darwin"
    ];
    sourceProvenance = [ lib.sourceTypes.binaryNativeCode ];
  };
}
