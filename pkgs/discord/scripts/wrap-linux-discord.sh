#!/usr/bin/env bash
# shellcheck shell=bash
if [[ "${BASH_SOURCE[0]}" = "$0" ]]; then
  set -euo pipefail
fi

target=$1
stage_modules=$2
modules_dir=$3
deploy_krisp=$4
enable_krisp=$5
command_line_args=$6

if [[ "$enable_krisp" = 1 ]]; then
  wrapProgramShell "$target" \
    --run "$stage_modules $modules_dir" \
    --run "$deploy_krisp"
else
  wrapProgramShell "$target" \
    --run "$stage_modules $modules_dir"
fi

wrapProgramShell "$target" \
  --prefix LD_LIBRARY_PATH : /run/opengl-driver/lib

if [[ -n "$command_line_args" ]]; then
  wrapProgramShell "$target" \
    --add-flags "$command_line_args"
fi
