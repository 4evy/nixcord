#!/usr/bin/env bash
# shellcheck shell=bash
# shellcheck disable=SC2154
if [[ "${BASH_SOURCE[0]}" = "$0" ]]; then
  set -euo pipefail
fi

binary_name=$1
launcher_c=$2
prepare_data=$3
stage_modules=$4
modules_dir=$5
deploy_krisp=$6
target=$7
enable_krisp=$8
command_line_args=$9
cc=${10}
rcodesign=${11}
python3=${12}
prepare_signing=${13}
app_data_dir_file=${14}
mod_data_dir_file=${15}
mod_data_env=${16}
mod_data_suffix=${17}

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
  --replace-fail "@prepare_data@" "$prepare_data" \
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
