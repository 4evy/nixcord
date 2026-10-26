{ callPackage, configuration }:
let
  buildPackage = callPackage ../../../../../nix/rust-package.nix { };
in
buildPackage {
  pname = "discord-launcher";
  crate = ./.;
  env.NIXCORD_LAUNCHER_CONFIG = builtins.toJSON configuration;
}
