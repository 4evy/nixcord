{
  homeModules = {
    class = "homeManager";
    module = ../modules/hm;
    output = "homeModules.default";
  };
  nixosModules = {
    class = "nixos";
    module = ../modules/nixos;
    output = "nixosModules.default";
  };
  darwinModules = {
    class = "darwin";
    module = ../modules/darwin;
    output = "darwinModules.default";
  };
}
