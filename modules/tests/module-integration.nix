{
  pkgs,
  home-manager,
  nix-darwin,
}:
let
  inherit (pkgs) lib;
  isDarwin = pkgs.stdenv.hostPlatform.isDarwin;
  home = if isDarwin then "/Users/nixcord-test" else "/home/nixcord-test";
  package = lib.customisation.makeOverridable (
    _: pkgs.writeShellScriptBin "nixcord-integration-client" "exit 0"
  ) { };
  settings = {
    enable = true;
    discord.enable = false;
    vesktop = {
      enable = true;
      inherit package;
      useSystemVencord = false;
      settings.integration = "client";
    };
    config.plugins.alwaysAnimate.enable = true;
    quickCss = "body { color: purple; }";
    config.useQuickCss = true;
  };
  moduleArgs._module.args.nixcordPkgs = { };
  hm =
    enabled:
    home-manager.lib.homeManagerConfiguration {
      inherit pkgs;
      modules = [
        ../hm
        moduleArgs
        {
          home = {
            username = "nixcord-test";
            homeDirectory = home;
            stateVersion = "26.05";
          };
          manual.manpages.enable = false;
          programs.nixcord = settings // {
            enable = enabled;
          };
        }
      ];
    };
  systemModules =
    enabled:
    [
      (if isDarwin then ../darwin else ../nixos)
      moduleArgs
      {
        documentation.enable = false;
        nixpkgs.pkgs = pkgs;
        programs.nixcord = settings // {
          enable = enabled;
          user = "nixcord-test";
        };
        users.users.nixcord-test.home = home;
        system.stateVersion = if isDarwin then 6 else "26.05";
      }
    ]
    ++ lib.optionals (!isDarwin) [
      {
        users.users.nixcord-test.isNormalUser = true;
        boot.loader.grub.devices = [ "nodev" ];
        fileSystems."/" = {
          device = "none";
          fsType = "tmpfs";
        };
      }
    ];
  system =
    enabled:
    if isDarwin then
      nix-darwin.lib.darwinSystem { modules = systemModules enabled; }
    else
      import (pkgs.path + "/nixos/lib/eval-config.nix") {
        system = pkgs.stdenv.hostPlatform.system;
        modules = systemModules enabled;
      };
  hmEnabled = hm true;
  hmDisabled = hm false;
  systemEnabled = system true;
  systemDisabled = system false;
  assertionsPass = evaluated: builtins.all (a: a.assertion) evaluated.config.assertions;
  activationText =
    evaluated:
    if isDarwin then
      evaluated.config.system.activationScripts.script.text
    else
      evaluated.config.system.activationScripts.script;
  enabledScript = activationText systemEnabled;
  disabledScript = activationText systemDisabled;
  clientDir = if isDarwin then "Library/Application Support/vesktop" else ".config/vesktop";
  disabledHomeFiles = builtins.attrNames hmDisabled.config.home.file;
  enabledPackage = hmEnabled.config.programs.nixcord.finalPackage.vesktop;
  hasClient = packages: builtins.any (p: toString p == toString enabledPackage) packages;
  ownsFile = path: lib.strings.hasInfix "vesktop" path;
  ownsActivation = name: lib.strings.hasPrefix "nixcord-" name;
in
assert assertionsPass hmEnabled;
assert assertionsPass hmDisabled;
assert assertionsPass systemEnabled;
assert assertionsPass systemDisabled;
assert hasClient hmEnabled.config.home.packages;
assert hasClient systemEnabled.config.environment.systemPackages;
assert !(hasClient hmDisabled.config.home.packages);
assert !(hasClient systemDisabled.config.environment.systemPackages);
assert !(builtins.any ownsFile disabledHomeFiles);
assert !(builtins.any ownsActivation (builtins.attrNames hmDisabled.config.home.activation));
assert
  !(lib.strings.hasInfix "nixcord-vesktop" (builtins.unsafeDiscardStringContext disabledScript));
assert lib.strings.hasInfix "nixcord-vesktop" (builtins.unsafeDiscardStringContext enabledScript);
pkgs.runCommand "nixcord-module-integration" { nativeBuildInputs = [ pkgs.jq ]; } ''
  jq -e '.integration == "client"' \
    '${hmEnabled.activationPackage}/home-files/${clientDir}/settings.json'
  jq -e '.plugins.AlwaysAnimate.enabled == true' \
    '${hmEnabled.activationPackage}/home-files/${clientDir}/settings/settings.json'
  diff -u <(printf '%s' 'body { color: purple; }') \
    '${hmEnabled.activationPackage}/home-files/${clientDir}/settings/quickCss.css'
  # Inspect the assembled script without activating a system during the build.
  grep -F 'nixcord-vesktop' ${pkgs.writeText "system-activation" enabledScript}
  touch "$out"
''
