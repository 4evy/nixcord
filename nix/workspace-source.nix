{ lib }:
let
  # Match package.json's packages/* workspace without walking build outputs
  # or node_modules inside each package.
  packageDirectories = lib.attrsets.filterAttrs (_: type: type == "directory") (
    builtins.readDir ../packages
  );
  packageManifests = lib.attrsets.mapAttrsToList (
    name: _: lib.fileset.maybeMissing (../packages + "/${name}/package.json")
  ) packageDirectories;
in
lib.fileset.toSource {
  root = ./..;
  # Bun validates every workspace even when installation uses a filter.
  fileset = lib.fileset.unions (
    [
      ../package.json
      ../bun.lock
      ../docs/site/package.json
    ]
    ++ packageManifests
  );
}
