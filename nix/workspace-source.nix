{ lib }:
let
  # Workspaces are explicit, dependency-ordered paths in the root manifest.
  manifest = builtins.fromJSON (builtins.readFile ../package.json);
  packageManifests = map (workspace: ../. + "/${workspace}/package.json") manifest.workspaces;
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
