{
  pkgs,
  openasar ? pkgs.openasar,
}:

{
  regression-matrix = import ./examples/regression-matrix.nix { inherit pkgs; };
  config-output = import ./modules/config-output { inherit pkgs; };
  assertions = import ./modules/assertions { inherit pkgs; };
  activation-scripts = import ./activation-scripts.nix { inherit pkgs; };
  platform-paths = import ./platform-paths.nix { inherit pkgs; };
  darwin-activation-stage = import ./darwin-activation-stage.nix { inherit pkgs; };
  hm-writable-files = import ./hm-writable-files.nix { inherit pkgs; };
  discord-package-arguments = import ./discord-package-arguments.nix { inherit pkgs; };
  discord-openasar = import ./discord-openasar.nix { inherit pkgs openasar; };
  discord-launcher-c = import ./c/discord-launcher.nix { inherit pkgs; };
}
// pkgs.lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux {
  nixos-activation-safety = import ./nixos-activation-safety.nix { inherit pkgs; };
  discord-linux-scripts = import ./discord-linux-scripts.nix { inherit pkgs; };
  discord-update-sources = import ./discord-update-sources.nix { inherit pkgs; };
}
