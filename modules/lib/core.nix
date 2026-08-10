{
  lib,
  parseRules,
  libva,
  stdenv,
  ...
}:
let
  inherit (import ./config.nix { inherit lib; }) toSnakeCase;
  inherit (import ./discord.nix { inherit lib; })
    getDiscordBranches
    getPrimaryDiscordBranch
    packageSupportsOverride
    ;

  defaultParseRules = lib.trivial.importJSON ../plugins/parse-rules.json;

  upperNames = lib.lists.unique (defaultParseRules.upperNames ++ parseRules.upperNames);
  upperNamesMask = lib.attrsets.genAttrs upperNames (_: null);
  lowerPluginTitles = lib.lists.unique (
    defaultParseRules.lowerPluginTitles ++ parseRules.lowerPluginTitles
  );
  lowerPluginTitlesMask = lib.attrsets.genAttrs lowerPluginTitles (_: null);
  settingRenames = lib.attrsets.recursiveUpdate defaultParseRules.settingRenames parseRules.settingRenames;
  pluginRenames = lib.attrsets.recursiveUpdate (defaultParseRules.pluginRenames or { }) (
    parseRules.pluginRenames or { }
  );

  isLowerCase = s: lib.strings.toLower s == s;

  unNixify = nixName: lib.strings.toUpper (toSnakeCase nixName);

  isLowerCamel = string: isLowerCase (builtins.substring 0 1 string);

  toUpper =
    string:
    lib.strings.concatStrings [
      (lib.strings.toUpper (builtins.substring 0 1 string))
      (builtins.substring 1 (builtins.stringLength string) string)
    ];

  specialRenames = {
    enable = "enabled";
    tagSettings = "tagSettings";
    useQuickCss = "useQuickCSS";
    webRichPresence = "WebRichPresence (arRPC)";
    _24hTime = "24h Time";
    showOwnTimezone = "Show Own Timezone";
  };

  # mkNormalizeName :: string -> (string -> value -> string)
  # Builds a context-specific converter for Nix option names using
  # specialRenames, settingRenames, pluginRenames, upperNames, and lowerPluginTitles.
  mkNormalizeName =
    context:
    let
      contextRenames = settingRenames.${context} or { };
      pluginContext = context == "plugins";
    in
    name: value:
    let
      specialName = specialRenames.${name} or null;
      renamedSetting = contextRenames.${name} or null;
      pluginRename = pluginRenames.${name} or null;
    in
    if specialName != null then
      specialName
    else if renamedSetting != null then
      renamedSetting
    else if pluginContext && pluginRename != null then
      pluginRename
    else if builtins.hasAttr name upperNamesMask then
      unNixify name
    else if builtins.hasAttr name lowerPluginTitlesMask then
      name
    else if pluginContext && builtins.isAttrs value && value ? enable && isLowerCamel name then
      toUpper name
    else
      name;

  # mkVencordCfgInner :: string -> attrset -> attrset
  # Recursively transforms Nix option names to their JSON counterparts.
  mkVencordCfgInner =
    context: cfg:
    let
      normalizeName = mkNormalizeName context;
    in
    lib.attrsets.mapAttrs' (
      name: value:
      let
        normalizedValue = if builtins.isAttrs value then mkVencordCfgInner name value else value;
      in
      lib.attrsets.nameValuePair (normalizeName name value) normalizedValue
    ) cfg;

  mkVencordCfg = mkVencordCfgInner "";

  # mkFinalPackages :: { cfg, vencord, equicord } -> { discord, discordBranches, vesktop, equibop, goofcord, dorion, legcord }
  # Builds the final patched packages for each client.
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
        if cfg.discord.package.passthru.nixcordCommandLineArgsList or false then
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
                    if [ -f "$file" ] && grep -Fq 'join(SESSION_DATA_DIR, "equicord.asar")' "$file"; then
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
              nixcordSupportDir="$out/share/nixcord/goofcord"
              mkdir -p "$nixcordSupportDir"

              cat assets/preVencord.js ${lib.strings.escapeShellArg goofcordSettingsBootstrap} \
                > "$nixcordSupportDir/preVencord.js"
              cp assets/postVencord.js "$nixcordSupportDir/postVencord.js"
              cp ${lib.strings.escapeShellArg "${goofcordBrowserBuild}/browser.js"} \
                "$nixcordSupportDir/clientMod.js"
              cp ${lib.strings.escapeShellArg "${goofcordBrowserBuild}/browser.css"} \
                "$nixcordSupportDir/clientMod.css"
              cp ${lib.strings.escapeShellArg goofcordQuickCss} "$nixcordSupportDir/quickCss.css"
              cp ${lib.strings.escapeShellArg goofcordThemes} "$nixcordSupportDir/themes.css"
            '';
          });

      dorion = cfg.dorion.package;

      legcord = cfg.legcord.package;
    };
in
{
  inherit mkVencordCfg mkFinalPackages;
}
