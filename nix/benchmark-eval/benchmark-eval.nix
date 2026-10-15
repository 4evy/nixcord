# Force generated files and activation output so shallow imports cannot hide work
{
  source,
  system,
}:
let
  sourcePath = builtins.toPath source;
  flake = builtins.getFlake source;
  pkgs = import flake.inputs.nixpkgs {
    inherit system;
    config.allowUnfree = true;
  };
  lib = pkgs.lib.extend (
    _final: _previous: {
      hm.dag.entryAfter = after: data: { inherit after data; };
    }
  );
  stubs = import (sourcePath + "/modules/tests/lib/stubs.nix");
  moduleConfig = {
    enable = true;
    discord.enable = true;
    discord.vencord.enable = true;
    vesktop.enable = true;
    quickCss = "body { color: red; }";
    config = {
      useQuickCss = true;
      plugins.fakeNitro.enable = true;
    };
  };
  common = config: {
    packageDrvs = map (package: package.drvPath) config.packages;
    inherit (config) assertions warnings;
  };
  moduleArgs = {
    _module.args = { inherit pkgs system; };
  };
  homeConfig =
    (lib.modules.evalModules {
      modules = [
        stubs.hm
        flake.homeModules.nixcord
        moduleArgs
        { programs.nixcord = moduleConfig; }
      ];
      specialArgs = { inherit pkgs; };
    }).config;
  nixosConfig =
    (lib.modules.evalModules {
      modules = [
        stubs.nixos
        flake.nixosModules.nixcord
        moduleArgs
        {
          programs.nixcord = moduleConfig // {
            user = "testuser";
          };
          users.users.testuser = {
            name = "testuser";
            home = "/home/testuser";
            isNormalUser = true;
          };
        }
      ];
      specialArgs = { inherit pkgs; };
    }).config;
  darwinConfig =
    (lib.modules.evalModules {
      modules = [
        stubs.darwin
        flake.darwinModules.nixcord
        moduleArgs
        {
          programs.nixcord = moduleConfig // {
            user = "testuser";
          };
          users.users.testuser = {
            name = "testuser";
            home = "/Users/testuser";
          };
        }
      ];
      specialArgs = { inherit pkgs; };
    }).config;
in
{
  # Isolate declaration/default evaluation from client package dependencies
  plugin-options =
    let
      optionLib = import (flake.inputs.nixpkgs + "/lib");
    in
    (optionLib.modules.evalModules {
      modules = [ (sourcePath + "/modules/options/vencord-config.nix") ];
    }).config.programs.nixcord.config;

  home-manager =
    common {
      packages = homeConfig.home.packages;
      inherit (homeConfig) assertions warnings;
    }
    // {
      files = lib.attrsets.mapAttrs (_: file: toString file.source) homeConfig.home.file;
      activation = lib.attrsets.mapAttrs (_: entry: entry.data or entry) homeConfig.home.activation;
    };
  nixos =
    common {
      packages = nixosConfig.environment.systemPackages;
      inherit (nixosConfig) assertions warnings;
    }
    // {
      activation = lib.attrsets.mapAttrs (
        _: entry: entry.text or entry
      ) nixosConfig.system.activationScripts;
    };
  nix-darwin =
    common {
      packages = darwinConfig.environment.systemPackages;
      inherit (darwinConfig) assertions warnings;
    }
    // {
      activation = lib.attrsets.mapAttrs (
        _: entry: entry.text or entry
      ) darwinConfig.system.activationScripts;
    };
}
