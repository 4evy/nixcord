{ inputs, ... }:
{
  imports = [ inputs.treefmt-nix.flakeModule ];

  perSystem =
    { pkgs, ... }:
    {
      devShells.default = import ../dev-shell.nix { inherit pkgs; };
      treefmt = import ../../treefmt.nix;
    };
}
