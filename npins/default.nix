# Share the flake lock with non-flake callers so `nix flake update` updates
# both entry points atomically, without requiring flakes during evaluation
# Fetch the locked official NixOS zstd archive, not the moving channel URL
let
  lock = builtins.fromJSON (builtins.readFile ../flake.lock);
  input = lock.nodes.${lock.root}.inputs.nixpkgs-nixcord;
  source = lock.nodes.${input}.locked;
in
assert source.type == "tarball";
{
  nixpkgs = builtins.fetchTarball {
    url = source.url;
    sha256 = source.narHash;
  };
}
