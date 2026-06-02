(import (
  let
    lock = builtins.fromJSON (builtins.readFile ./flake.lock);
    locked = lock.nodes.flake-compat.locked;
  in
  fetchTarball {
    url =
      if builtins.hasAttr "url" locked && locked.url != null then
        locked.url
      else
        "https://github.com/edolstra/flake-compat/archive/${locked.rev}.tar.gz";
    sha256 = locked.narHash;
  }
) { src = ./.; }).defaultNix
