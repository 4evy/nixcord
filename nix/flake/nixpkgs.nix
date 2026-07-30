{ inputs, ... }:
{
  perSystem =
    { system, ... }:
    {
      _module.args.pkgs = import inputs.nixpkgs-nixcord {
        inherit system;
        config.allowUnfree = true;
      };
    };
}
