{ lib, rustPlatform }:
{ pname, crate, ... }@args:
let
  workspace = lib.importTOML ../Cargo.toml;
  members = workspace.workspace.members;
in
rustPlatform.buildRustPackage (
  {
    inherit pname;
    inherit (workspace.workspace.package) version;
    # Cargo resolves every workspace manifest, even for a single selected binary
    src = lib.fileset.toSource {
      root = ./..;
      fileset = lib.fileset.unions (
        [
          ../Cargo.toml
          ../Cargo.lock
          crate
        ]
        ++ map (member: lib.path.append ../. "${member}/Cargo.toml") members
      );
    };
    # Unbuilt members need targets, but their sources need not affect this build
    postPatch = ''
      for member in ${lib.escapeShellArgs members}; do
        if [[ ! -d "$member/src" ]]; then
          mkdir --parents "$member/src"
          printf 'fn main() {}\n' > "$member/src/main.rs"
        fi
      done
    '';
    cargoLock.lockFile = ../Cargo.lock;
    cargoBuildFlags = [
      "--package"
      pname
    ];
    cargoTestFlags = [
      "--package"
      pname
    ];
    meta = {
      mainProgram = pname;
      platforms = lib.platforms.linux ++ lib.platforms.darwin;
    };
  }
  // removeAttrs args [ "crate" ]
)
