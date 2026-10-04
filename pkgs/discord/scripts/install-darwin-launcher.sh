#!/usr/bin/env bash
# shellcheck shell=bash
# shellcheck disable=SC2154
if [[ "${BASH_SOURCE[0]}" = "$0" ]]; then
  set -euo pipefail
fi

binary_name=$1
launcher_c=$2
stage_modules=$3
modules_dir=$4
deploy_krisp=$5
target=$6
enable_krisp=$7
command_line_args=$8
cc=$9
rcodesign=${10}
python3=${11}
prepare_signing=${12}
app_data_dir_file=${13}
mod_data_dir_file=${14}
mod_data_env=${15}
mod_data_suffix=${16}

launcher_cflags=(
  -std=c23
  -Wall
  -Wextra
  -Wpedantic
  -Wconversion
  -Wsign-conversion
  -Wcast-qual
  -Wwrite-strings
  -Wformat=2
  -Wshadow
  -Wstrict-prototypes
  -Wmissing-prototypes
  -Wold-style-definition
  -Wundef
  -Wvla
  -Walloca
  -Werror
)

app_executable="$out/Applications/$binary_name.app/Contents/MacOS/$binary_name"
app_executable_unwrapped="$app_executable.unwrapped"
mv "$app_executable" "$app_executable_unwrapped"

cp "$launcher_c" nixcord-discord-launcher.c
substituteInPlace nixcord-discord-launcher.c \
  --replace-fail "@app_data_dir_file@" "$app_data_dir_file" \
  --replace-fail "@mod_data_dir_file@" "$mod_data_dir_file" \
  --replace-fail "@mod_data_env@" "$mod_data_env" \
  --replace-fail "@mod_data_suffix@" "$mod_data_suffix" \
  --replace-fail "@stage_modules@" "$stage_modules" \
  --replace-fail "@modules_dir@" "$modules_dir" \
  --replace-fail "@deploy_krisp@" "$deploy_krisp" \
  --replace-fail "@target@" "$target" \
  --replace-fail "@enable_krisp@" "$enable_krisp" \
  --replace-fail "@command_line_args@" "$command_line_args"

"$cc" "${launcher_cflags[@]}" -Os -o "$app_executable" nixcord-discord-launcher.c
chmod +x "$app_executable"

# The upstream CLI wrapper runs helpers against the old, protected profile.
# Finder and the CLI must both enter the same native launcher first.
rm "$out/bin/$binary_name"
ln -s "$app_executable" "$out/bin/$binary_name"

"$python3" "$prepare_signing" \
  "$rcodesign" "$out/Applications/$binary_name.app" "$binary_name"
