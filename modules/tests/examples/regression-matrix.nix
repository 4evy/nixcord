{ pkgs }:

let
  testLib = import ../lib { inherit pkgs; };
  inherit (testLib) lib stubs;

  matrix = import ../fixtures/regression-matrix/scenarios.nix { inherit lib; };
  scenarioNames = builtins.attrNames matrix.scenarios;

  nixcordModule = modulePath: {
    imports = [ modulePath ];
    _module.args.nixcordPkgs = { };
  };

  inputs = {
    nixcord = {
      homeModules.nixcord = nixcordModule ../../hm;
      nixosModules.nixcord = nixcordModule ../../nixos;
      darwinModules.nixcord = nixcordModule ../../darwin;
    };
  };

  sort = lib.sort builtins.lessThan;

  expectedFileNames =
    expected:
    sort (
      lib.optionals expected.discord (
        [
          "discord-quick-css"
          "discord-settings"
        ]
        ++ lib.optional (expected.discordMod != null) "${expected.discordMod}-settings"
      )
      ++ lib.optionals expected.vesktop [
        "vesktop-settings"
        "vesktop-client-settings"
        "vesktop-state"
        "vesktop-quick-css"
        "vesktop-theme-regression"
      ]
      ++ lib.optionals expected.equibop [
        "equibop-settings"
        "equibop-client-settings"
        "equibop-state"
        "equibop-quick-css"
        "equibop-theme-regression"
      ]
      ++ lib.optional expected.dorion "dorion-config"
      ++ lib.optionals expected.legcord (
        [ "legcord-settings" ]
        ++ lib.concatMap (bundle: [
          "legcord-${bundle}-js"
          "legcord-${bundle}-css"
        ]) expected.legcordBundles
      )
    );

  expectedConfigDir =
    moduleSystem: expected:
    let
      suffix = if expected.discordMod == "equicord" then "Equicord" else "Vencord";
    in
    if moduleSystem == "nix-darwin" then
      "/Users/demo/Library/Application Support/${suffix}"
    else if moduleSystem == "home-manager" && !pkgs.stdenvNoCC.isLinux then
      "/home/demo/Library/Application Support/${suffix}"
    else
      "/home/demo/.config/${suffix}";

  moduleSystems = {
    home-manager = {
      stub = stubs.hm;
      module = ../fixtures/regression-matrix/home-manager.nix;
    };
  }
  // lib.optionalAttrs pkgs.stdenvNoCC.isLinux {
    nixos = {
      stub = stubs.nixos;
      module = ../fixtures/regression-matrix/nixos.nix;
    };
  }
  // lib.optionalAttrs pkgs.stdenvNoCC.isDarwin {
    nix-darwin = {
      stub = stubs.darwin;
      module = ../fixtures/regression-matrix/nix-darwin.nix;
    };
  };

  evalCase =
    moduleSystem: moduleSpec: scenarioName:
    let
      scenario = matrix.scenarios.${scenarioName};
      evaluated = lib.evalModules {
        modules = [
          moduleSpec.stub
          moduleSpec.module
        ];
        specialArgs = {
          inherit inputs pkgs;
          scenario = scenarioName;
        };
      };
      inherit (evaluated) config;
      cfg = config.programs.nixcord;
      common = import ../../lib/mkCommonConfig.nix { inherit config lib pkgs; };
      actualFiles = sort (map (spec: spec.name) common.fileSpecs);
      expectedFiles = expectedFileNames scenario.expected;
      missing = lib.filter (name: !(builtins.elem name actualFiles)) expectedFiles;
      unexpected = lib.filter (name: !(builtins.elem name expectedFiles)) actualFiles;
      missingPlugins = lib.filter (
        pluginName: !(cfg.config.plugins.${pluginName}.enable or false)
      ) scenario.expected.pluginNames;
      assertionsPassed = lib.all (assertion: assertion.assertion or true) config.assertions;
      caseName = "${moduleSystem}:${scenarioName}";
    in
    if !cfg.enable then
      throw "${caseName} did not enable programs.nixcord"
    else if cfg.user != "demo" then
      throw "${caseName} target user was ${cfg.user}, expected demo"
    else if cfg.configDir != expectedConfigDir moduleSystem scenario.expected then
      throw "${caseName} configDir was ${toString cfg.configDir}, expected ${toString (expectedConfigDir moduleSystem scenario.expected)}"
    else if !assertionsPassed then
      throw "${caseName} produced a failed assertion"
    else if missing != [ ] then
      throw "${caseName} missing generated files: ${toString missing}"
    else if unexpected != [ ] then
      throw "${caseName} generated unexpected files: ${toString unexpected}"
    else if missingPlugins != [ ] then
      throw "${caseName} did not enable expected generated plugins: ${toString missingPlugins}"
    else
      true;

  results = lib.mapAttrs (
    moduleSystem: moduleSpec: map (evalCase moduleSystem moduleSpec) scenarioNames
  ) moduleSystems;

  moduleSystemCount = builtins.length (builtins.attrNames moduleSystems);
  scenarioCount = builtins.length scenarioNames;
  caseCount = moduleSystemCount * scenarioCount;
in
assert builtins.deepSeq results true;
pkgs.runCommand "regression-matrix-eval-test" { } ''
  echo "Regression matrix evaluated ${toString caseCount} module-system/scenario cases"
  touch "$out"
''
