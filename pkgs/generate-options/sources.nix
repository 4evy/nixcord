{ lib }:
let
  root = ../..;
  generatedPackageDirectories = [
    "build"
    "coverage"
    "dist"
    "node_modules"
  ];
  packageSources = lib.fileset.fromSource (
    lib.sources.cleanSourceWith {
      src = ../../packages;
      filter =
        path: type:
        let
          name = baseNameOf path;
        in
        lib.sources.cleanSourceFilter path type
        && !(type == "directory" && builtins.elem name generatedPackageDirectories)
        && !(lib.strings.hasSuffix ".tsbuildinfo" name);
    }
  );
in
{
  project = lib.fileset.toSource {
    inherit root;
    fileset = lib.fileset.unions [
      (lib.fileset.fromSource (import ../../nix/workspace-source.nix { inherit lib; }))
      ../../tsconfig.json
      ../../tsconfig.base.json
      ../../vitest.workspace.ts
      ../../vite.config.shared.ts
      ../../modules/plugins/overrides.json
      ../../modules/plugins/deprecated.json
      ../../modules/plugins/migrations.nix
      packageSources
    ];
  };
}
