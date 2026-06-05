#!/usr/bin/env bash
# shellcheck shell=bash
if [[ "${BASH_SOURCE[0]}" = "$0" ]]; then
  set -euo pipefail
fi

resources_dir=$1
asar_bin=$2

app_asar_dir=$(mktemp -d)

cleanup() {
  rm -rf "$app_asar_dir"
}
trap cleanup EXIT

"$asar_bin" extract "$resources_dir/app.asar" "$app_asar_dir"
substituteInPlace "$app_asar_dir/bundle.js" \
  --replace-fail \
    'exports.USE_NEW_UPDATER=settings?.get("USE_NEW_UPDATER",!1)||"win32"===process.platform||"linux"===process.platform' \
    'exports.USE_NEW_UPDATER=settings?.get("USE_NEW_UPDATER")??("win32"===process.platform||"linux"===process.platform)'
"$asar_bin" pack "$app_asar_dir" "$resources_dir/app.asar"
