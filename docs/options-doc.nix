{
  pkgs,
  lib,
  revision ? "main",
}:
let
  inherit (builtins)
    baseNameOf
    isPath
    readFile
    ;

  pathHasPrefix = lib.path.hasPrefix;
  pathRemovePrefix = lib.path.removePrefix;
  listHasPrefix = lib.lists.hasPrefix;

  nixcordRoot = ./..;
  nixcordRootString = toString nixcordRoot;
  nixcordRootPrefix = "${nixcordRootString}/";

  # Minimal Home Manager-shaped module context for evaluating Nixcord options.
  baseHomeManagerModule =
    { lib, ... }:
    let
      visible = false;
    in
    {
      options = {
        home.homeDirectory = lib.options.mkOption {
          inherit visible;
          type = lib.types.path;
          default = "/home/user";
          description = "User's home directory";
        };

        xdg.configHome = lib.options.mkOption {
          inherit visible;
          type = lib.types.path;
          default = "/home/user/.config";
          description = "XDG config directory";
        };
      };

      config = {
        home.homeDirectory = lib.modules.mkDefault "/home/user";
        xdg.configHome = lib.modules.mkDefault "/home/user/.config";
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
        plugins = lib.attrsets.attrNames (lib.trivial.importJSON path);
        lines = linesWithNumbers path;
      })
      [
        ../modules/plugins/shared.json
        ../modules/plugins/vencord.json
        ../modules/plugins/equicord.json
      ];

  pluginSourceByName = lib.attrsets.mergeAttrsList (
    map (source: lib.attrsets.genAttrs source.plugins (_: source)) pluginSources
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
      source = pluginSourceByName.${pluginName} or null;
      sourceSubpath = if source == null then "modules/plugins" else source.subpath;
      line =
        if source == null then
          1
        else if lib.lists.length opt.loc >= 6 then
          pluginSettingLine source pluginName (lib.lists.elemAt opt.loc 5)
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

  evaluatedModules = lib.modules.evalModules {
    modules = docsModules;
    class = "homeManager";
    specialArgs = { inherit pkgs; };
  };
in
pkgs.buildPackages.nixosOptionsDoc {
  options = lib.attrsets.removeAttrs evaluatedModules.options [ "_module" ];
  transformOptions = transformOption;
  warningsAreErrors = false;
}
