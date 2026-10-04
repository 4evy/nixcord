{ lib }:
let
  # Workspaces are explicit, dependency-ordered paths in the root manifest.
  manifest = lib.trivial.importJSON ../package.json;
  packageManifests = map (
    workspace: lib.path.append ../. "${workspace}/package.json"
  ) manifest.workspaces;
in
lib.fileset.toSource {
  root = ./..;
  fileset = lib.fileset.unions (
    [
      ../.npmrc
      ../package.json
      ../package-lock.json
    ]
    ++ packageManifests
  );
}
