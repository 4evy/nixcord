#!/usr/bin/env bash
# shellcheck shell=bash
if [[ "${BASH_SOURCE[0]}" = "$0" ]]; then
  set -euo pipefail
fi

exec env DISCORD_BRANCHES="${DISCORD_BRANCHES:-stable,ptb,canary,development}" python3 "${DISCORD_UPDATE_SOURCES_PY:?}"
