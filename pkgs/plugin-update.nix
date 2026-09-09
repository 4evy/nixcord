{
  writeShellApplication,
  nix,
  nix-update,
  jq,
}:
{ attrPath, filename }:
let
  script = writeShellApplication {
    name = "update-${attrPath}";
    runtimeInputs = [
      nix
      nix-update
      jq
    ];
    text = ''
      # Resolve the branch revision and date without depending on release tags.
      nix-update --flake --src-only --version=branch=main \
        '--version-regex=.*-(unstable-[0-9]{4}-[0-9]{2}-[0-9]{2})' \
        --override-filename ${filename} ${attrPath}

      snapshot=$(nix eval --raw .#${attrPath}.version)
      source=$(nix build --no-link --print-out-paths .#${attrPath}.src)
      upstream_version=$(jq -er '.version | select(test("^[0-9]+(\\.[0-9]+)+$"))' "$source/package.json")
      version="$upstream_version-''${snapshot#unstable-}"

      # Refresh dependencies using the version from the exact source revision.
      nix-update --flake --no-src --version="$version" \
        --override-filename ${filename} ${attrPath}
    '';
  };
in
[ "${script}/bin/update-${attrPath}" ]
