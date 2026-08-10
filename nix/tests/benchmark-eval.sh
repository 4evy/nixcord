#!/usr/bin/env bash
# shellcheck shell=bash

set -euo pipefail

script_dir=$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
benchmark="$script_dir/../benchmark-eval.sh"
missing_ref=refs/nixcord-benchmark-test/does-not-exist
failures=0

check() {
  local name=$1
  local expected_status=$2
  local expected_output=$3
  local output
  local actual_status
  shift 3

  set +e
  output=$("$@" 2>&1)
  actual_status=$?
  set -e

  if [[ $actual_status != "$expected_status" || $output != *"$expected_output"* ]]; then
    printf 'FAIL %s: status=%s, expected=%s, output=%q\n' \
      "$name" "$actual_status" "$expected_status" "$output" >&2
    failures=$((failures + 1))
  else
    printf 'PASS %s\n' "$name"
  fi
}

check help 0 'Usage:' bash "$benchmark" --help
check help-without-dependencies 0 'Usage:' \
  env -i PATH=/nonexistent /bin/bash --noprofile --norc "$benchmark" --help
check missing-runs 2 '--runs requires a value' bash "$benchmark" --runs
check missing-system 2 '--system requires a value' bash "$benchmark" --system --skip-ifd
check empty-runs 2 '--runs requires a value' bash "$benchmark" --runs=
check empty-system 2 '--system requires a value' bash "$benchmark" --system=
check unknown-option 2 'Unknown option: --unknown' bash "$benchmark" --unknown
check extra-revisions 2 'Only one Git revision' bash "$benchmark" HEAD HEAD~1
check zero-runs 2 'Run count must be an integer from 1 through 1000' bash "$benchmark" --runs 0
check negative-runs 2 'Run count must be an integer from 1 through 1000' bash "$benchmark" --runs=-1
check nonnumeric-runs 2 "got 'nope'" bash "$benchmark" --runs nope
check excessive-runs 2 'Run count must be an integer from 1 through 1000' \
  bash "$benchmark" --runs 1001
check huge-runs 2 'Run count must be an integer from 1 through 1000' \
  bash "$benchmark" --runs 999999999999999999999999
check leading-zero-runs 2 'does not resolve to a commit' \
  env NIXCORD_EVAL_SYSTEM=x86_64-linux bash "$benchmark" --runs 0008 "$missing_ref"
check equals-options 2 'does not resolve to a commit' \
  bash "$benchmark" --runs=001 --system=x86_64-linux "$missing_ref"
check invalid-ref 2 'does not resolve to a commit' \
  env NIXCORD_EVAL_SYSTEM=x86_64-linux bash "$benchmark" "$missing_ref"
check dash-prefixed-ref 2 'does not resolve to a commit' \
  env NIXCORD_EVAL_SYSTEM=x86_64-linux bash "$benchmark" -- --not-a-ref
check missing-commands 127 'required command(s) not found: git jq nix' \
  env -i PATH=/nonexistent NIXCORD_EVAL_SYSTEM=x86_64-linux \
  /bin/bash --noprofile --norc "$benchmark" HEAD

old_pwd=$PWD
cd /tmp
check invocation-outside-repository 2 'does not resolve to a commit' \
  env NIXCORD_EVAL_SYSTEM=x86_64-linux bash "$benchmark" "$missing_ref"
cd "$old_pwd"

if (( failures > 0 )); then
  printf '%s benchmark CLI test(s) failed.\n' "$failures" >&2
  exit 1
fi
