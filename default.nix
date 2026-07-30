{
  system ? builtins.currentSystem,
  sources ? import ./npins,
  nixpkgs ? sources.nixpkgs,
  pkgs ? import nixpkgs {
    inherit system;
    config.allowUnfree = true;
  },
  revision ? "main",
}:
let
  packages = import ./nix/packages.nix {
    inherit pkgs revision;
  };
  mkModule =
    {
      class,
      module,
      output,
    }:
    { pkgs, ... }:
    let
      location = "${toString ./.}/default.nix#${output}";
    in
    {
      _class = class;
      _file = location;
      key = location;
      imports = [ module ];
      _module.args.nixcordPkgs = import ./nix/packages.nix {
        inherit pkgs revision;
      };
    };
  moduleOutputs = import ./nix/mk-module-outputs.nix { inherit mkModule; };
  overlay = final: _previous: {
    nixcord = import ./nix/packages.nix {
      pkgs = final;
      inherit revision;
    };
  };
in
packages
// moduleOutputs
// {
  inherit packages;

  overlay = overlay;
  overlays.default = overlay;
}
