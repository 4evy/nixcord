{ pkgs }:

{
  hm-eval = import ./eval/hm.nix { inherit pkgs; };
  nixos-eval = import ./eval/nixos.nix { inherit pkgs; };
  config-output = import ./modules/config-output { inherit pkgs; };
  assertions = import ./modules/assertions { inherit pkgs; };
  discord-app-asar-patch = import ./discord-app-asar.nix { inherit pkgs; };
  discord-launcher-c = import ./c/discord-launcher.nix { inherit pkgs; };
}
// pkgs.lib.optionalAttrs pkgs.stdenv.hostPlatform.isDarwin {
  darwin-eval = import ./eval/darwin.nix { inherit pkgs; };
}
