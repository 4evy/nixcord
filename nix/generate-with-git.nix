# Keep the checkout's Git history when copying these sources into the store.
{
  root,
  system,
  vencordSource,
  equicordSource,
}:
let
  flake = builtins.getFlake root;
  pkgs = import flake.inputs.nixpkgs-nixcord {
    inherit system;
    config.allowUnfree = true;
  };
in
pkgs.callPackage (/. + "${root}/pkgs/generate-options") {
  vencordSource = /. + vencordSource;
  equicordSource = /. + equicordSource;
  skipGitMigrations = false;
}
