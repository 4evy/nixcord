{
  description = "nixcord regression matrix examples for Home Manager, NixOS, and nix-darwin";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";

    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    nix-darwin = {
      url = "github:nix-darwin/nix-darwin";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    nixcord = {
      url = "github:4evy/nixcord";
      inputs.nixpkgs.follows = "nixpkgs";
      inputs.nixpkgs-nixcord.follows = "nixpkgs";
    };
  };

  outputs =
    {
      home-manager,
      nix-darwin,
      nixpkgs,
      ...
    }@inputs:
    let
      pluginRoot = "${inputs.nixcord}/modules/plugins";
      matrix = import ./scenarios.nix {
        lib = nixpkgs.lib;
        inherit pluginRoot;
      };
      scenario = matrix.defaultScenario;
      linuxSystem = "x86_64-linux";
      darwinSystem = "aarch64-darwin";
      pkgs = import nixpkgs {
        system = linuxSystem;
        config.allowUnfree = true;
      };
    in
    {
      homeConfigurations.demo = home-manager.lib.homeManagerConfiguration {
        inherit pkgs;
        extraSpecialArgs = { inherit inputs pluginRoot scenario; };
        modules = [ ./home-manager.nix ];
      };

      nixosConfigurations.demo = nixpkgs.lib.nixosSystem {
        system = linuxSystem;
        specialArgs = { inherit inputs pluginRoot scenario; };
        modules = [ ./nixos.nix ];
      };

      darwinConfigurations.demo = nix-darwin.lib.darwinSystem {
        system = darwinSystem;
        specialArgs = { inherit inputs pluginRoot scenario; };
        modules = [ ./nix-darwin.nix ];
      };
    };
}
