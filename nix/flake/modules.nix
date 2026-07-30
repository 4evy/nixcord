{
  inputs,
  moduleWithSystem,
  ...
}:
let
  mkModule =
    {
      class,
      module,
      output,
    }:
    moduleWithSystem (
      { self', ... }:
      {
        _class = class;
        _file = "${inputs.self.outPath}/flake.nix#${output}";
        key = "${inputs.self.outPath}/flake.nix#${output}";
        imports = [ module ];
        _module.args.nixcordPkgs = self'.packages;
      }
    );
in
{
  flake = import ../mk-module-outputs.nix { inherit mkModule; };
}
