{
  lib,
  writeShellApplication,
  writeShellScript,
  nix-update-script,
  nix,
  bun,
  jq,
  patch,
  coreutils,
}:
{
  attrPath,
  extraArgs ? [ ],
  prepareLockfile ? "",
}:
let
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
      jq
      patch
    ];
    text = ''
      ${update ([ "--src-only" ] ++ extraArgs)}

      # Bun lockfile generation is not supported by nix-update yet
      root="$PWD"
      source=$(nix build --no-link --print-out-paths .#${attrPath}.src)
      patches=$(nix eval --json .#${attrPath}.bunDeps.patches)
      work=$(mktemp --directory)
      trap 'rm --recursive --force -- "$work"' EXIT
      cp --recursive "$source/." "$work/"
      chmod --recursive u+w "$work"
      cd -P "$work"
      while IFS= read -r source_patch; do
        patch --strip=1 < "$source_patch"
      done < <(jq --raw-output '.[]' <<< "$patches")
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
