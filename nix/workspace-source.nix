{ lib }:
let
  # Read the explicit workspace paths from the root manifest
  manifest = lib.trivial.importJSON ../package.json;
  packageManifests = map (
    workspace: lib.path.append ../. "${workspace}/package.json"
  ) manifest.workspaces;
in
lib.fileset.toSource {
  root = ./..;
  fileset = lib.fileset.unions (
    [
      ../bunfig.toml
      ../package.json
      ../bun.lock
    ]
    ++ packageManifests
  );
}
