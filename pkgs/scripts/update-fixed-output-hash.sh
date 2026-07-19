#!/usr/bin/env bash

set -euo pipefail

usage() {
  echo "Usage: $0 get FILE SYSTEM | set FILE SYSTEM HASH | refresh FILE SYSTEM -- COMMAND..." >&2
  exit 2
}

get_hash() {
  local file=$1
  local system=$2
  local matches
  matches=$(SYSTEM="$system" perl -ne \
    'print "$1\n" if /^\s*\Q$ENV{SYSTEM}\E = "([^"]+)";/' "$file")
  if [[ -z "$matches" || "$matches" == *$'\n'* ]]; then
    echo "Expected exactly one hash for $system in $file" >&2
    exit 1
  fi
  printf '%s\n' "$matches"
}

set_hash() {
  local file=$1
  local system=$2
  local hash=$3
  get_hash "$file" "$system" >/dev/null
  SYSTEM="$system" NEW_HASH="$hash" perl -pi -e \
    's|^(\s*)\Q$ENV{SYSTEM}\E = "[^"]+";|$1$ENV{SYSTEM} = "$ENV{NEW_HASH}";|' "$file"
  if [[ "$(get_hash "$file" "$system")" != "$hash" ]]; then
    echo "Failed to set the hash for $system in $file" >&2
    exit 1
  fi
}

refresh_hash() {
  local file=$1
  local system=$2
  shift 2
  [[ "${1:-}" == "--" ]] || usage
  shift
  [[ "$#" -gt 0 ]] || usage

  local attempt new_hash output
  for attempt in {1..4}; do
    if output=$("$@" 2>&1); then
      exit 0
    fi
    new_hash=$(grep -oE 'got:[[:space:]]+sha256-[A-Za-z0-9+/=]+' <<< "$output" \
      | tail -1 | sed -E 's/got:[[:space:]]*//' || true)
    if [[ -z "$new_hash" || "$attempt" -eq 4 ]]; then
      printf '%s\n' "$output" >&2
      exit 1
    fi
    set_hash "$file" "$system" "$new_hash"
  done
}

case "${1:-}" in
  get)
    [[ "$#" -eq 3 ]] || usage
    get_hash "$2" "$3"
    ;;
  set)
    [[ "$#" -eq 4 ]] || usage
    set_hash "$2" "$3" "$4"
    ;;
  refresh)
    [[ "$#" -ge 5 ]] || usage
    refresh_hash "$2" "$3" "${@:4}"
    ;;
  *)
    usage
    ;;
esac
