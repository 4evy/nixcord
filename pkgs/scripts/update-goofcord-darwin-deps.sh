#!/usr/bin/env bash
# shellcheck shell=bash

set -euo pipefail

deps_file=pkgs/goofcord.nix
hash_updater=pkgs/scripts/update-fixed-output-hash.sh
supported_system=aarch64-darwin

usage() {
  echo "Usage: $0 [get-version | set-version VERSION]" >&2
  exit 2
}

repo_root=$(git rev-parse --show-toplevel)
cd "$repo_root"

get_version() {
  local matches
  matches=$(perl -ne 'print "$1\n" if /^\s*version = "([^"]+)";/' "$deps_file")
  if [[ -z "$matches" || "$matches" == *$'\n'* ]]; then
    echo "Expected exactly one version in $deps_file" >&2
    exit 1
  fi
  printf '%s\n' "$matches"
}

set_version() {
  local version=$1

  [[ "$version" =~ ^[0-9A-Za-z._+-]+$ ]] || {
    echo "Invalid GoofCord version: $version" >&2
    exit 1
  }

  VERSION="$version" perl -pi -e \
    's|^(\s*)version = "[^"]+";|$1version = "$ENV{VERSION}";|' "$deps_file"

  if [[ "$(get_version)" != "$version" ]]; then
    echo "Failed to set GoofCord version in $deps_file" >&2
    exit 1
  fi
}

case "${1:-}" in
get-version)
  [[ "$#" -eq 1 ]] || usage
  get_version
  exit 0
  ;;
set-version)
  [[ "$#" -eq 2 ]] || usage
  set_version "$2"
  exit 0
  ;;
"")
  ;;
*)
  usage
  ;;
esac

actual_system=$(nix eval --impure --raw --expr builtins.currentSystem)
if [[ "$actual_system" != "$supported_system" ]]; then
  echo "GoofCord Darwin dependencies must be updated on $supported_system, got $actual_system" >&2
  exit 1
fi

original_deps=$(<"$deps_file")
cleanup() {
  local exit_code=$?
  if [[ "$exit_code" -ne 0 ]]; then
    printf '%s\n' "$original_deps" >"$deps_file"
  fi
  exit "$exit_code"
}
trap cleanup EXIT

goofcord_version=$(nix eval --raw ".#packages.$supported_system.goofcord.version")

set_version "$goofcord_version"

"$hash_updater" refresh "$deps_file" "$supported_system" -- \
  bash -euo pipefail -c "
    nix --option system '$supported_system' build \\
      --no-link .#checks.$supported_system.goofcord-support
    nix --option system '$supported_system' build \\
      --rebuild --no-link .#checks.$supported_system.goofcord-support
  "

printf 'GoofCord Darwin dependencies are current: %s (%s)\n' \
  "$goofcord_version" \
  "$("$hash_updater" get "$deps_file" "$supported_system")"
