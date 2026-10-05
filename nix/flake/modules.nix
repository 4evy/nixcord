{ inputs }:
let
  mkModule =
    {
      class,
      module,
      output,
    }:
    { config, ... }:
    let
      # Match moduleWithSystem's explicit-system preference and pkgs fallback.
      system =
        config._module.args.system or config._module.args.pkgs.stdenv.hostPlatform.system
          or (throw "Cannot determine the module configuration's system");
      location = "${inputs.self.outPath}/flake.nix#${output}";
    in
    {
      _class = class;
      _file = location;
      key = location;
      imports = [ module ];
      # Reuse the public outputs, including overrides, just as self'.packages did.
      _module.args.clientPackages =
        inputs.self.packages.${system}
          or (throw "No flake packages are defined for system ${system}; use programs.nixcord.useGlobalPkgs or provide package outputs for that system");
    };
in
import ../mk-module-outputs.nix { inherit mkModule; }
