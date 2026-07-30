{
  system ? builtins.currentSystem,
  sources ? import ./npins,
  nixpkgs ? sources.nixpkgs,
  pkgs ? import nixpkgs { inherit system; },
}:
import ./nix/dev-shell.nix { inherit pkgs; }
