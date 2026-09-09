# Share the flake lock with non-flake callers so `nix flake update` updates
# both entry points atomically, without requiring flakes during evaluation.
let
  lock = builtins.fromJSON (builtins.readFile ../flake.lock);
  input = lock.nodes.${lock.root}.inputs.nixpkgs-nixcord;
  source = lock.nodes.${input}.locked;
in
assert source.type == "github";
{
  nixpkgs = builtins.fetchTarball {
    url = "https://github.com/${source.owner}/${source.repo}/archive/${source.rev}.tar.gz";
    sha256 = source.narHash;
  };
}
