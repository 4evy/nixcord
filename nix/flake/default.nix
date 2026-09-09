{ inputs }:
let
  inherit (inputs.nixpkgs-nixcord) lib;
  revision = lib.findFirst (rev: rev != null) "main" [
    (inputs.self.rev or null)
    (inputs.self.dirtyRev or null)
  ];
  packagesFor = pkgs: import ../../pkgs { inherit pkgs revision; };
  forSystem =
    system:
    let
      pkgs = import inputs.nixpkgs-nixcord {
        inherit system;
        config.allowUnfree = true;
      };
      packages = packagesFor pkgs;
      treefmt = inputs.treefmt-nix.lib.evalModule pkgs ../../treefmt.nix;
    in
    {
      inherit packages;
      apps = (import ./apps.nix { inherit pkgs packages; }).apps;
      checks = (import ./checks.nix { inherit inputs pkgs packages; }).checks // {
        treefmt = treefmt.config.build.check inputs.self;
      };
      devShells.default = import ../dev-shell.nix { inherit pkgs; };
      formatter = treefmt.config.build.wrapper;
    };
  perSystem = lib.genAttrs [
    "x86_64-linux"
    "aarch64-linux"
    "aarch64-darwin"
  ] forSystem;
in
import ./modules.nix { inherit inputs; }
// lib.genAttrs [ "packages" "apps" "checks" "devShells" "formatter" ] (
  output: lib.mapAttrs (_: outputs: outputs.${output}) perSystem
)
// {
  # Like easyOverlay, build against the package set before this overlay.
  overlays.default = _final: prev: { nixcord = packagesFor prev; };
}
