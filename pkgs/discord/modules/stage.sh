#!/usr/bin/env bash
# shellcheck shell=bash
if [[ "${BASH_SOURCE[0]}" = "$0" ]]; then
  set -o errexit -o nounset -o pipefail
fi

store_modules=$1

if [[ "${DISCORD_STAGE_PLATFORM:?}" = darwin ]]; then
  config_base=${DISCORD_USER_DATA_DIR:-$HOME/Library/Application Support}
  config_dir="$config_base/${DISCORD_CONFIG_DIR_NAME:?}"
else
  config_base=${DISCORD_USER_DATA_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}}
  config_dir="$config_base/${DISCORD_CONFIG_DIR_NAME:?}"
fi

modules_dir="$config_dir/${DISCORD_VERSION:?}/modules"
module_dirs=("$modules_dir")
if [[ "${DISCORD_STAGE_PLATFORM:?}" = darwin ]]; then
  module_dirs+=("$config_dir/module_data")
fi
staged_modules=" ${DISCORD_STAGED_MODULES:-} "

remove_module() {
  if [[ -L "$1" ]]; then
    rm "$1"
  elif [[ -e "$1" ]]; then
    chmod --recursive u+w "$1" 2>/dev/null || true
    rm --recursive --force "$1"
  fi
}

replace_link() {
  remove_module "$2"
  ln --symbolic "$1" "$2"
}

prune_unstaged_modules() {
  local dir=$1
  local path
  local module

  [[ -d "$dir" ]] || return 0
  for path in "$dir"/discord_*; do
    [[ -e "$path" ]] || continue
    module=${path##*/}
    case "$staged_modules" in
    *" $module "*) ;;
    *)
      remove_module "$path"
      rm --force "$dir/pending/$module"-*.zip 2>/dev/null || true
      ;;
    esac
  done
}

mkdir --parents "${module_dirs[@]}"

settings_file="$config_dir/settings.json"
if [[ -f "$settings_file" ]]; then
  jq ". + ${DISCORD_DISABLED_UPDATE_SETTINGS_JSON:?}" "$settings_file" >"$settings_file.tmp"
  mv "$settings_file.tmp" "$settings_file"
else
  printf '%s\n' "${DISCORD_DISABLED_UPDATE_SETTINGS_JSON:?}" >"$settings_file"
fi

for dir in "${module_dirs[@]}"; do
  prune_unstaged_modules "$dir"

  for module in ${DISCORD_STAGED_MODULES:-}; do
    # The Krisp deployer owns this writable module and its repair watcher
    # Keep it in the manifest and prune allow-list without staging it here
    [[ "$module" != discord_krisp ]] || continue
    replace_link "$store_modules/$module" "$dir/$module"
  done
done

printf '%s\n' "${DISCORD_INSTALLED_MODULES_JSON:?}" >"$modules_dir/installed.json.tmp"
mv "$modules_dir/installed.json.tmp" "$modules_dir/installed.json"
