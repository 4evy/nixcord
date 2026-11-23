{
  lib,
  writeShellApplication,
  writeShellScript,
  nix-update-script,
  nix,
  callPackage,
  patch,
  coreutils,
}:
{
  attrPath,
  patches,
  extraArgs ? [ ],
  prepareLockfile ? "",
}:
let
  bun = callPackage ../../nix/bun/bun.nix { };
  update =
    extraArgs:
    lib.escapeShellArgs (nix-update-script {
      inherit attrPath;
      extraArgs = [
        "--flake"
        "--override-filename=pkgs/${attrPath}/default.nix"
      ]
      ++ extraArgs;
    });
  script = writeShellApplication {
    name = "update-${attrPath}";
    runtimeInputs = [
      coreutils
      nix
      bun
      patch
    ];
    text = ''
      ${update ([ "--src-only" ] ++ extraArgs)}

      # Bun lockfile generation is not supported by nix-update yet
      root="$PWD"
      source=$(nix build --no-link --print-out-paths .#${attrPath}.src)
      work=$(mktemp --directory)
      trap 'rm --recursive --force -- "$work"' EXIT
      cp --recursive "$source/." "$work/"
      chmod --recursive u+w "$work"
      cd -P "$work"
      # Embed store dependencies instead of reading paths from the lazy flake source
      source_patches=(${lib.escapeShellArgs (map (file: "${file}") patches)})
      for source_patch in "''${source_patches[@]}"; do
        patch --strip=1 < "$source_patch"
      done
      cp "$root/pkgs/${attrPath}/bun.lock" bun.lock
      ${prepareLockfile}
      bun install --lockfile-only --ignore-scripts
      cp bun.lock "$root/pkgs/${attrPath}/bun.lock"
      cd "$root"

      ${update [
        "--version=skip"
        "--no-src"
        "--custom-dep=bunDeps"
      ]}
    '';
  };
in
writeShellScript "update-${attrPath}" ''
  exec ${lib.getExe script} "$@"
''
