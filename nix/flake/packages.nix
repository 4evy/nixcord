{ inputs, ... }:
{
  imports = [ inputs.flake-parts.flakeModules.easyOverlay ];

  perSystem =
    {
      config,
      pkgs,
      ...
    }:
    let
      revision =
        if inputs.self ? rev && inputs.self.rev != null then
          inputs.self.rev
        else if inputs.self ? dirtyRev && inputs.self.dirtyRev != null then
          inputs.self.dirtyRev
        else
          "main";
    in
    {
      packages = import ../packages.nix {
        inherit pkgs revision;
      };

      overlayAttrs.nixcord = config.packages;
    };
}
