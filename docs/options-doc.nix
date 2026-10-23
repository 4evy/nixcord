{
  pkgs,
  lib,
  revision ? "main",
}:
let
  inherit (builtins)
    isPath
    readFile
    ;

  pathHasPrefix = lib.path.hasPrefix;
  pathRemovePrefix = lib.path.removePrefix;
  listHasPrefix = lib.lists.hasPrefix;

  nixcordRoot = ./..;
  nixcordRootString = toString nixcordRoot;
  nixcordRootPrefix = "${nixcordRootString}/";

  mkGitHubDeclaration = subpath: line: {
    url =
      "https://github.com/4evy/nixcord/blob/${revision}/${subpath}"
      + lib.strings.optionalString (line != null) "#L${toString line}";
    name = "<nixcord/${subpath}>";
  };

  declarationToGitHub =
    decl:
    let
      declStr = toString decl;
    in
    if isPath decl && pathHasPrefix nixcordRoot decl then
      mkGitHubDeclaration (lib.strings.removePrefix "./" (pathRemovePrefix nixcordRoot decl)) null
    else if lib.strings.hasPrefix nixcordRootPrefix declStr then
      mkGitHubDeclaration (lib.strings.removePrefix nixcordRootPrefix declStr) null
    else
      decl;

  linesWithNumbers =
    file:
    lib.lists.imap1 (line: text: {
      inherit text;
      inherit line;
    }) (lib.strings.splitString "\n" (readFile file));

  findLine =
    entries: predicate: fallback:
    (lib.lists.findFirst predicate { line = fallback; } entries).line;

  pluginSettingLine =
    source: pluginName: settingPath:
    (lib.lists.foldl'
      (position: settingName: {
        indent = position.indent + "  ";
        line = findLine source.lines (
          entry:
          entry.line >= position.line
          && lib.strings.hasPrefix "${position.indent}\"${settingName}\" = " entry.text
        ) position.line;
      })
      {
        indent = "    ";
        line = findLine source.lines (entry: entry.text == "  \"${pluginName}\" = {") 1;
      }
      settingPath
    ).line;

  pluginPaths = import ../modules/plugins/schema/schema.nix;
  pluginSource = {
    subpath = "modules/plugins/options/options.nix";
    lines = linesWithNumbers ../modules/plugins/options/options.nix;
  };

  pluginSourcesByName = lib.attrsets.zipAttrsWith (_: sources: sources) (
    map
      (
        category:
        lib.attrsets.mapAttrs (_: plugin: {
          inherit category;
          inherit (plugin) settings;
        }) pluginPaths.${category}
      )
      [
        "shared"
        "vencord"
        "equicord"
      ]
  );

  isNixcordOption = opt: listHasPrefix [ "programs" "nixcord" ] opt.loc;

  isPluginOption =
    opt:
    listHasPrefix [
      "programs"
      "nixcord"
      "config"
      "plugins"
    ] opt.loc
    && lib.lists.length opt.loc >= 5;

  pluginDeclaration =
    opt:
    let
      pluginName = lib.lists.elemAt opt.loc 4;
      settingPath = lib.lists.drop 5 opt.loc;
      sourceSettingPath =
        if settingPath != [ ] && lib.lists.last settingPath == "enable" then
          lib.lists.init settingPath
        else
          settingPath;
      schemaPath = lib.lists.concatMap (name: [
        "settings"
        name
      ]) sourceSettingPath;
      source = lib.lists.findFirst (candidate: lib.attrsets.hasAttrByPath schemaPath candidate) null (
        lib.lists.reverseList (pluginSourcesByName.${pluginName} or [ ])
      );
      sourceSubpath = pluginSource.subpath;
      line =
        if source == null then
          1
        else if lib.lists.length opt.loc >= 6 then
          pluginSettingLine pluginSource pluginName sourceSettingPath
        else
          findLine pluginSource.lines (entry: entry.text == "  \"${pluginName}\" = {") 1;
    in
    mkGitHubDeclaration sourceSubpath line
    // lib.attrsets.optionalAttrs (source != null) {
      name = "${source.category} plugin option";
    };

  transformOption =
    opt:
    opt
    // {
      declarations =
        if isPluginOption opt then
          [ (pluginDeclaration opt) ]
        else if isNixcordOption opt && opt.declarations == [ ] then
          [ (mkGitHubDeclaration "modules/options" null) ]
        else
          map declarationToGitHub opt.declarations;
    };

  evaluatedModules = lib.modules.evalModules {
    modules = [
      ../modules/options
      {
        # Legacy option shims emit host warnings; documentation only needs their
        # declarations, so sink warnings while checking every other definition
        options.warnings = lib.options.mkSinkUndeclaredOptions { };
      }
    ];
    class = "homeManager";
    specialArgs = { inherit pkgs; };
  };
in
pkgs.buildPackages.nixosOptionsDoc {
  options = lib.attrsets.removeAttrs evaluatedModules.options [ "_module" ];
  transformOptions = transformOption;
  warningsAreErrors = false;
}
