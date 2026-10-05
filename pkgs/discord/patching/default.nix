{ lib, buildNpmPackage }:
# ts-morph uses the compatible JS compiler; native TypeScript 7 checks our types
buildNpmPackage {
  pname = "discord-patch-tools";
  version = "1.0.0";
  src = lib.fileset.toSource {
    root = ./.;
    fileset = lib.fileset.unions [
      ./package.json
      ./package-lock.json
    ];
  };
  npmDepsHash = "sha256-guGNfNDKn6g4gX/3XWJJDdhvV0dWivHedEkWIrs5lW0=";
  dontNpmBuild = true;
  installPhase = ''
    runHook preInstall
    mkdir -p "$out"
    cp -r node_modules "$out/"
    runHook postInstall
  '';
}
