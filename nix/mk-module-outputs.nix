{ mkModule }:
builtins.mapAttrs (
  _family: spec:
  let
    module = mkModule spec;
  in
  {
    default = module;
    nixcord = module;
  }
) (import ./module-specs.nix)
