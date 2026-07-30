#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
flake_lock="$repo_root/flake.lock"
npins_lock="$repo_root/npins/sources.json"
check_only=false

if [[ "${1:-}" == "--check" ]]; then
  check_only=true
elif [[ "$#" -ne 0 ]]; then
  echo "usage: $0 [--check]" >&2
  exit 2
fi

if [[ "$(jq -r '.nodes["nixpkgs-nixcord"].locked.type' "$flake_lock")" != "github" ]]; then
  echo "nixpkgs-nixcord must remain a GitHub flake input" >&2
  exit 1
fi

owner=$(jq -er '.nodes["nixpkgs-nixcord"].locked.owner' "$flake_lock")
repo=$(jq -er '.nodes["nixpkgs-nixcord"].locked.repo' "$flake_lock")
branch=$(jq -er '.nodes["nixpkgs-nixcord"].original.ref' "$flake_lock")
revision=$(jq -er '.nodes["nixpkgs-nixcord"].locked.rev' "$flake_lock")
hash=$(jq -er '.nodes["nixpkgs-nixcord"].locked.narHash' "$flake_lock")
url="https://github.com/$owner/$repo/archive/$revision.tar.gz"

generated=$(mktemp "${TMPDIR:-/tmp}/nixcord-npins.XXXXXX")
trap 'rm -f "$generated"' EXIT

jq \
  --arg owner "$owner" \
  --arg repo "$repo" \
  --arg branch "$branch" \
  --arg revision "$revision" \
  --arg url "$url" \
  --arg hash "$hash" \
  '
    .pins.nixpkgs.type = "Git"
    | .pins.nixpkgs.repository = {
        type: "GitHub",
        owner: $owner,
        repo: $repo
      }
    | .pins.nixpkgs.branch = $branch
    | .pins.nixpkgs.submodules = false
    | .pins.nixpkgs.revision = $revision
    | .pins.nixpkgs.url = $url
    | .pins.nixpkgs.hash = $hash
  ' "$npins_lock" > "$generated"

if cmp --silent "$generated" "$npins_lock"; then
  exit 0
fi

if "$check_only"; then
  echo "npins/sources.json is out of sync with nixpkgs-nixcord in flake.lock" >&2
  diff -u "$npins_lock" "$generated" || true
  exit 1
fi

mv "$generated" "$npins_lock"
trap - EXIT
