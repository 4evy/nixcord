{
  pkgs,
  inputs,
  self,
}:
let
  testLib = import ./lib { inherit pkgs; };
  inherit (testLib) lib stubs;
  system = pkgs.stdenv.hostPlatform.system;
  specs = import ../../nix/module-specs.nix;
  stubFor = {
    homeModules = stubs.hm;
    nixosModules = stubs.nixos;
    darwinModules = stubs.darwin;
  };
  eval =
    flake: family: extraModules:
    lib.evalModules {
      class = specs.${family}.class;
      modules = [
        stubFor.${family}
        flake.${family}.default
        { _module.args.pkgs = pkgs; }
      ]
      ++ extraModules;
    };
  marker = pkgs.runCommand "nixcord-flake-interface-marker" { } "touch $out";
  withPackages =
    packages:
    (import "${self.outPath}/flake.nix").outputs (
      inputs
      // {
        self = self // {
          inherit packages;
        };
      }
    );
  overridden = withPackages {
    ${system} = self.packages.${system} // {
      vencord = marker;
    };
  };
  unavailable = withPackages (throw "The flake package outputs must remain lazy");
  moduleTests = lib.concatMapAttrs (
    family: spec:
    let
      pinned = {
        programs.nixcord.useGlobalPkgs = false;
      };
      consumerPackages = {
        _module.args.pkgs = lib.mkForce (
          pkgs
          // {
            callPackage =
              path: args: if builtins.baseNameOf path == "vencord" then marker else pkgs.callPackage path args;
          }
        );
      };
      evaluated = eval self family [ pinned ];
      bothAliases = eval self family [
        self.${family}.nixcord
        pinned
      ];
      disabled = eval self family [
        { disabledModules = [ "${self.outPath}/flake.nix#${spec.output}" ]; }
      ];
    in
    {
      "${family}: selects the public pinned package" =
        evaluated.config.programs.nixcord.discord.vencord.package.drvPath
        == self.packages.${system}.vencord.drvPath;
      "${family}: observes overridden public packages" =
        (eval overridden family [ pinned ]).config.programs.nixcord.discord.vencord.package.drvPath
        == marker.drvPath;
      "${family}: pinned packages ignore consumer package customizations" =
        (eval self family [
          pinned
          consumerPackages
        ]).config.programs.nixcord.discord.vencord.package.drvPath
        == self.packages.${system}.vencord.drvPath;
      "${family}: global packages honor consumer package customizations" =
        (eval self family [ consumerPackages ]).config.programs.nixcord.discord.vencord.package.drvPath
        == marker.drvPath;
      "${family}: both aliases can be imported together" =
        bothAliases.config.programs.nixcord.discord.vencord.package.drvPath
        == evaluated.config.programs.nixcord.discord.vencord.package.drvPath
        && builtins.length bothAliases.options.programs.nixcord.enable.declarations == 1;
      "${family}: the stable module key supports disabledModules" =
        !(disabled.options ? programs.nixcord);
      "${family}: rejects the wrong module class" =
        !(builtins.tryEval (
          (lib.evalModules {
            class = "wrongClass";
            modules = [ self.${family}.default ];
          }).config
        )).success;
      "${family}: disabled configuration does not force flake packages" =
        !(eval unavailable family [ pinned ]).config.programs.nixcord.enable;
      "${family}: useGlobalPkgs does not force flake packages" =
        (eval unavailable family [
          { programs.nixcord.useGlobalPkgs = true; }
        ]).config.programs.nixcord.discord.vencord.package.drvPath
        == (pkgs.callPackage ../../pkgs/vencord { }).drvPath;
    }
  ) specs;
  explicitSystem = eval self "homeModules" [
    { _module.args.system = "x86_64-linux"; }
  ];
  hm = inputs.home-manager.lib.homeManagerConfiguration {
    inherit pkgs;
    modules = [
      self.homeModules.default
      {
        programs.nixcord.useGlobalPkgs = false;
        home = {
          username = "nixcord-test";
          homeDirectory =
            if pkgs.stdenv.hostPlatform.isDarwin then "/Users/nixcord-test" else "/home/nixcord-test";
          stateVersion = "26.05";
        };
      }
    ];
  };
  systemConfig =
    if pkgs.stdenv.hostPlatform.isDarwin then
      inputs.nix-darwin.lib.darwinSystem {
        modules = [
          self.darwinModules.default
          {
            nixpkgs.pkgs = pkgs;
            programs.nixcord.useGlobalPkgs = false;
          }
        ];
      }
    else
      inputs.nixpkgs.lib.nixosSystem {
        modules = [
          self.nixosModules.default
          {
            nixpkgs.pkgs = pkgs;
            programs.nixcord.useGlobalPkgs = false;
          }
        ];
      };
in
testLib.run.tests "flake-interface" (
  moduleTests
  // {
    "explicit system takes precedence over the consuming package set" =
      explicitSystem._module.args.nixcordPkgs.vencord.drvPath
      == self.packages.x86_64-linux.vencord.drvPath;
    "real Home Manager receives pinned packages" =
      hm.config.programs.nixcord.discord.vencord.package.drvPath
      == self.packages.${system}.vencord.drvPath;
    "real system module receives pinned packages" =
      systemConfig.config.programs.nixcord.discord.vencord.package.drvPath
      == self.packages.${system}.vencord.drvPath;
    "unsupported systems fail when pinned packages are requested" =
      !(builtins.tryEval (
        (eval self "homeModules" [ { _module.args.system = "unsupported-system"; } ])
        ._module.args.nixcordPkgs
      )).success;
    "unsupported systems can use the consuming package set" =
      (eval self "homeModules" [
        {
          _module.args.system = "unsupported-system";
          programs.nixcord.useGlobalPkgs = true;
        }
      ]).config.programs.nixcord.discord.vencord.package.drvPath
      == (pkgs.callPackage ../../pkgs/vencord { }).drvPath;
    "overlay uses prev and does not force final" =
      (self.overlays.default (throw "overlay must not depend on final") (
        pkgs
        // {
          openasar = marker;
        }
      )).nixcord.openasar.drvPath == marker.drvPath;
  }
)
