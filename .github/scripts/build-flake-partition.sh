#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail

partition=$1
system=$2
host=$(nix eval --impure --raw --expr builtins.currentSystem)
if [[ "$system" != "$host" ]]; then
  echo "Expected a native $system runner, got $host" >&2
  exit 1
fi

nix_args=(--option allow-import-from-derivation false)
if [[ "$system" == *-darwin ]]; then
  nix_args+=(--max-jobs 1 --cores 2)
fi

# Both partitions select from the same list so new checks cannot fall through
targets=()
add_targets() {
  local output=$1 prefix=".#$1.$system" names name
  names=$(nix "${nix_args[@]}" eval --json "$prefix" --apply builtins.attrNames |
    jq -r --arg output "$output" --arg partition "$partition" '
      .[] | select($output == "packages" or
        (startswith("discord") == ($partition == "clients"))) | tojson')
  if [[ -n "$names" ]]; then
    while IFS= read -r name; do
      targets+=("$prefix.$name")
    done <<< "$names"
  fi
}

case "$partition" in
  modules) nix "${nix_args[@]}" flake check --no-build ;;
  clients) add_targets packages ;;
  *) echo "Unknown partition: $partition" >&2; exit 1 ;;
esac
add_targets checks
if (( ${#targets[@]} == 0 )); then
  echo "No targets in the $partition partition on $system" >&2
  exit 1
fi
nix "${nix_args[@]}" build --no-link --print-build-logs "${targets[@]}"
