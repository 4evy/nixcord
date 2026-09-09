{ inputs, lib, ... }:
{
  imports = [ inputs.flake-parts.flakeModules.easyOverlay ];

  perSystem =
    {
      config,
      pkgs,
      ...
    }:
    let
      revision = lib.lists.findFirst (rev: rev != null) "main" [
        (inputs.self.rev or null)
        (inputs.self.dirtyRev or null)
      ];
    in
    {
      packages = import ../../pkgs {
        inherit pkgs revision;
      };

      overlayAttrs.nixcord = config.packages;
    };
}
