{
  lib,
  libva,
  stdenv,
}:
let
  inherit (import ../discord.nix { inherit lib; })
    getDiscordBranches
    getPrimaryDiscordBranch
    packageSupportsOverride
    ;

  # Apply the selected mods and package options to each client
  mkFinalPackages =
    {
      cfg,
      vencord,
      equicord,
      goofcordBrowserBuild,
      goofcordSettingsBootstrap,
      goofcordQuickCss,
      goofcordThemes,
    }:
    let
      discordCommandLineArgs = lib.lists.unique cfg.discord.commandLineArgs;
      discordPackageSupportsKrisp = packageSupportsOverride cfg.discord.package "withKrisp";
      discordCommandLineArgsValue =
        if cfg.discord.package.passthru.commandLineArgsAsList or false then
          discordCommandLineArgs
        else
          lib.strings.escapeShellArgs discordCommandLineArgs;

      mkDiscord =
        branch:
        cfg.discord.package.override (
          {
            withVencord = cfg.discord.vencord.enable;
            withEquicord = cfg.discord.equicord.enable;
            withOpenASAR = cfg.discord.openASAR.enable;
            commandLineArgs = discordCommandLineArgsValue;
            inherit branch;
            vencord = if cfg.discord.vencord.enable then vencord else null;
            equicord = if cfg.discord.equicord.enable then equicord else null;
          }
          // lib.attrsets.optionalAttrs (cfg.discord.krisp.enable && discordPackageSupportsKrisp) {
            withKrisp = true;
          }
          //
            lib.attrsets.optionalAttrs
              (stdenv.hostPlatform.isDarwin && packageSupportsOverride cfg.discord.package "appDataDir")
              {
                appDataDir = builtins.dirOf (toString cfg.discord.configDir);
              }
          //
            lib.attrsets.optionalAttrs
              (stdenv.hostPlatform.isDarwin && packageSupportsOverride cfg.discord.package "modDataDir")
              {
                modDataDir = toString cfg.configDir;
              }
        );

      discordBranches = lib.attrsets.genAttrs (getDiscordBranches cfg) mkDiscord;
    in
    {
      inherit discordBranches;

      discord = discordBranches.${getPrimaryDiscordBranch cfg};

      vesktop = cfg.vesktop.package.override {
        withSystemVencord = cfg.vesktop.useSystemVencord;
        withMiddleClickScroll = cfg.vesktop.autoscroll.enable;
        inherit vencord;
      };

      equibop =
        if cfg.equibop.package != null then
          (cfg.equibop.package.override {
            withMiddleClickScroll = cfg.equibop.autoscroll.enable;
          }).overrideAttrs
            (old: {
              postPatch =
                (old.postPatch or "")
                + lib.strings.optionalString cfg.equibop.useSystemEquicord ''
                  equicordPatchTarget=
                  for file in src/main/vencordDir.ts src/main/constants.ts; do
                    if [ -f "$file" ] && grep --fixed-strings --quiet 'join(SESSION_DATA_DIR, "equicord.asar")' "$file"; then
                      equicordPatchTarget="$file"
                      break
                    fi
                  done

                  if [ -z "$equicordPatchTarget" ]; then
                    echo "could not find Equibop Equicord asar path to patch" >&2
                    exit 1
                  fi

                  substituteInPlace "$equicordPatchTarget" \
                    --replace-fail \
                      'join(SESSION_DATA_DIR, "equicord.asar")' \
                      '"${equicord}/equibop.asar"'
                '';
              postFixup = (old.postFixup or "") + ''
                wrapProgram $out/bin/equibop \
                  --prefix LD_LIBRARY_PATH : "${
                    lib.strings.makeLibraryPath [
                      libva
                      stdenv.cc.cc.lib
                    ]
                  }"
              '';
            })
        else
          null;

      goofcord =
        if cfg.goofcord.package == null || !cfg.goofcord.enable then
          cfg.goofcord.package
        else
          cfg.goofcord.package.overrideAttrs (old: {
            postInstall = (old.postInstall or "") + ''
              supportDir="$out/share/goofcord"
              mkdir --parents "$supportDir"

              cat assets/preVencord.js ${lib.strings.escapeShellArg goofcordSettingsBootstrap} \
                > "$supportDir/preVencord.js"
              cp assets/postVencord.js "$supportDir/postVencord.js"
              cp ${lib.strings.escapeShellArg "${goofcordBrowserBuild}/browser.js"} \
                "$supportDir/clientMod.js"
              cp ${lib.strings.escapeShellArg "${goofcordBrowserBuild}/browser.css"} \
                "$supportDir/clientMod.css"
              cp ${lib.strings.escapeShellArg goofcordQuickCss} "$supportDir/quickCss.css"
              cp ${lib.strings.escapeShellArg goofcordThemes} "$supportDir/themes.css"
            '';
          });

      dorion = cfg.dorion.package;

      legcord = cfg.legcord.package;
    };

in
{
  inherit mkFinalPackages;
  inherit (import ./installed.nix { inherit lib; }) mkInstalledPackages;
}
