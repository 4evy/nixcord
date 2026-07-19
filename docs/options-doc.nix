{
  pkgs,
  lib,
  revision ? "main",
}:
let
  inherit (builtins)
    baseNameOf
    fromJSON
    isPath
    readFile
    ;
  inherit (lib.attrsets)
    attrNames
    hasAttr
    listToAttrs
    nameValuePair
    removeAttrs
    ;
  inherit (lib.lists)
    concatMap
    elemAt
    findFirst
    imap0
    length
    take
    ;
  inherit (lib.modules) evalModules mkDefault;
  inherit (lib.strings)
    hasPrefix
    optionalString
    removePrefix
    splitString
    ;
  inherit (lib.trivial) pipe;

  pathHasPrefix = lib.path.hasPrefix;
  pathRemovePrefix = lib.path.removePrefix;

  nixcordRoot = ./..;
  nixcordRootString = toString nixcordRoot;
  nixcordRootPrefix = "${nixcordRootString}/";

  # Minimal Home Manager-shaped module context for evaluating Nixcord options.
  baseHomeManagerModule =
    { lib, ... }:
    let
      inherit (lib.options) mkOption;
      inherit (lib.types) path;

      visible = false;
    in
    {
      options = {
        home.homeDirectory = mkOption {
          inherit visible;
          type = path;
          default = "/home/user";
          description = "User's home directory";
        };

        xdg.configHome = mkOption {
          inherit visible;
          type = path;
          default = "/home/user/.config";
          description = "XDG config directory";
        };
      };

      config = {
        home.homeDirectory = mkDefault "/home/user";
        xdg.configHome = mkDefault "/home/user/.config";
      };
    };

  docsModules = [
    baseHomeManagerModule
    ../modules/options
    { _module.check = false; }
  ];

  mkGitHubDeclaration = subpath: line: {
    url =
      "https://github.com/4evy/nixcord/blob/${revision}/${subpath}"
      + optionalString (line != null) "#L${toString line}";
    name = "<nixcord/${subpath}>";
  };

  declarationToGitHub =
    decl:
    let
      declStr = toString decl;
    in
    if isPath decl && pathHasPrefix nixcordRoot decl then
      mkGitHubDeclaration (removePrefix "./" (pathRemovePrefix nixcordRoot decl)) null
    else if hasPrefix nixcordRootPrefix declStr then
      mkGitHubDeclaration (removePrefix nixcordRootPrefix declStr) null
    else
      decl;

  linesWithNumbers =
    file:
    imap0 (index: text: {
      inherit text;
      line = index + 1;
    }) (splitString "\n" (readFile file));

  findLine =
    entries: predicate: fallback:
    (findFirst predicate { line = fallback; } entries).line;

  pluginLine =
    source: pluginName: findLine source.lines (entry: entry.text == "  \"${pluginName}\": {") 1;

  pluginSettingLine =
    source: pluginName: settingName:
    let
      start = pluginLine source pluginName;
    in
    findLine source.lines (
      entry: entry.line >= start && entry.text == "      \"${settingName}\": {"
    ) start;

  pluginSources =
    map
      (path: {
        inherit path;
        subpath = "modules/plugins/${baseNameOf (toString path)}";
        plugins = attrNames (fromJSON (readFile path));
        lines = linesWithNumbers path;
      })
      [
        ../modules/plugins/shared.json
        ../modules/plugins/vencord.json
        ../modules/plugins/equicord.json
      ];

  pluginSourceByName = pipe pluginSources [
    (concatMap (source: map (pluginName: nameValuePair pluginName source) source.plugins))
    listToAttrs
  ];

  isNixcordOption =
    opt:
    take 2 opt.loc == [
      "programs"
      "nixcord"
    ];

  isPluginOption =
    opt:
    isNixcordOption opt
    && length opt.loc >= 5
    && elemAt opt.loc 2 == "config"
    && elemAt opt.loc 3 == "plugins";

  pluginDeclaration =
    opt:
    let
      pluginName = elemAt opt.loc 4;
      source = if hasAttr pluginName pluginSourceByName then pluginSourceByName.${pluginName} else null;
      sourceSubpath = if source == null then "modules/plugins" else source.subpath;
      line =
        if source == null then
          1
        else if length opt.loc >= 6 then
          pluginSettingLine source pluginName (elemAt opt.loc 5)
        else
          pluginLine source pluginName;
    in
    mkGitHubDeclaration sourceSubpath line;

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

  evaluatedModules = evalModules {
    modules = docsModules;
    class = "homeManager";
    specialArgs = { inherit pkgs; };
  };
in
pkgs.buildPackages.nixosOptionsDoc {
  options = removeAttrs evaluatedModules.options [ "_module" ];
  transformOptions = transformOption;
  warningsAreErrors = false;
}
