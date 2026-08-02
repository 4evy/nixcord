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
    lib.cleanSourceWith {
      src = ../../packages;
      filter =
        path: type:
        let
          name = baseNameOf path;
        in
        lib.cleanSourceFilter path type
        && !(type == "directory" && builtins.elem name generatedPackageDirectories)
        && !(lib.hasSuffix ".tsbuildinfo" name);
    }
  );
  # Bun validates every declared workspace path before applying install
  # filters, so the docs manifest is needed even though its deps are not.
  workspaceManifests = [
    ../../docs/site/package.json
    ../../packages/ast/package.json
    ../../packages/cli/package.json
    ../../packages/git-analyzer/package.json
    ../../packages/nix-generator/package.json
    ../../packages/parser/package.json
    ../../packages/shared/package.json
  ];
in
{
  dependencies = lib.fileset.toSource {
    inherit root;
    fileset = lib.fileset.unions (
      [
        ../../package.json
        ../../bun.lock
      ]
      ++ workspaceManifests
    );
  };

  project = lib.fileset.toSource {
    inherit root;
    fileset = lib.fileset.unions [
      ../../package.json
      ../../bun.lock
      ../../docs/site/package.json
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
