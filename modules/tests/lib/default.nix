{ pkgs }:

let
  lib = pkgs.lib.extend (
    _final: _prev: {
      hm.dag.entryAfter = after: data: {
        inherit after data;
      };
    }
  );

  fixtures = import ./fixtures.nix { inherit lib; };
  stubs = import ./stubs.nix { inherit lib; };
  eval = import ./eval.nix { inherit pkgs lib stubs; };
  output = import ./output.nix { inherit lib; };
  assertions = import ./assertions.nix { inherit eval; };
  run = import ./run.nix { inherit pkgs lib; };
in
{
  inherit
    lib
    fixtures
    stubs
    eval
    output
    assertions
    run
    ;
}
