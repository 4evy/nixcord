{ pkgs }:
let
  sccache = pkgs.writeShellScriptBin "sccache" ''
    # The server outlives the shell, so keep scratch files off temporary tmpfs
    export TMPDIR="''${XDG_CACHE_HOME:-$HOME/.cache}/nixcord/tmp"
    ${pkgs.coreutils}/bin/mkdir --parents "$TMPDIR"
    exec ${pkgs.lib.getExe pkgs.sccache} "$@"
  '';
in
pkgs.mkShell {
  packages = [
    pkgs.rustup
    sccache
  ];

  # Cache dependencies while Cargo incrementally rebuilds workspace binaries
  RUSTC_WRAPPER = pkgs.lib.getExe sccache;
  SCCACHE_CACHE_SIZE = "5G";

  shellHook = ''
    echo "Rust shell: cargo build --locked, cargo build --locked --release"
    echo "Compiler cache statistics: sccache --show-stats"
  '';
}
