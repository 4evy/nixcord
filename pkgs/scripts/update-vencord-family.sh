#!/usr/bin/env bash
# shellcheck shell=bash

client_name="@clientName@"
nix_file="@nixFile@"
owner="@owner@"
repo="@repo@"
version_var="@versionVar@"
hash_var="@hashVar@"
rev_var="@revVar@"
pnpm_hash_var="@pnpmHashVar@"
call_package_args="@callPackageArgs@"
branch="@branch@"
dependency_name="@dependencyName@"

wrong_hash="sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
root_package_json_file="./package.json"
bun_lock_file="./bun.lock"
parsed_nix_expr=""
original_nix_content=""
original_root_package_json_content=""
original_bun_lock_content=""

die() {
  printf '%s\n' "$*" >&2
  exit 1
}

log() {
  printf '%s\n' "$*"
}

read_file_into() {
  local path="$1"
  local -n output_ref="$2"

  # shellcheck disable=SC2034 # output_ref is assigned through a nameref.
  IFS= read -r -d '' output_ref < "$path" || true
}

read_file_into "$nix_file" original_nix_content
read_file_into "$root_package_json_file" original_root_package_json_content
read_file_into "$bun_lock_file" original_bun_lock_content

cleanup() {
  local exit_code=$?
  if [[ $exit_code -ne 0 ]]; then
    printf '%s' "$original_nix_content" > "$nix_file"
    printf '%s' "$original_root_package_json_content" > "$root_package_json_file"
    printf '%s' "$original_bun_lock_content" > "$bun_lock_file"
  fi
  exit "$exit_code"
}
trap cleanup EXIT

parse_nix_file() {
  if [[ -z "$parsed_nix_expr" ]]; then
    parsed_nix_expr=$(nix-instantiate --parse "$nix_file") ||
      die "Failed to parse $nix_file"
  fi

  printf '%s\n' "$parsed_nix_expr"
}

nix_string_literal_for() {
  local var_name="$1"
  local parsed
  local attr_re

  [[ "$var_name" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] ||
    die "Invalid Nix variable name: $var_name"

  parsed=$(parse_nix_file)
  attr_re="(^|[[:space:];])${var_name}[[:space:]]=[[:space:]](\"([^\"\\]|\\.)*\");"

  if [[ "$parsed" =~ $attr_re ]]; then
    printf '%s\n' "${BASH_REMATCH[2]}"
    return
  fi

  return 1
}

get_nix_value() {
  local var_name="$1"
  local literal

  literal=$(nix_string_literal_for "$var_name") ||
    die "Could not read $var_name from $nix_file"

  nix eval --impure --raw --expr "$literal" ||
    die "Failed to evaluate $var_name from $nix_file"
}

nix_quote_string() {
  local value="$1"

  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  value=${value//\$\{/\\\$\{}
  value=${value//$'\n'/\\n}

  printf '"%s"' "$value"
}

update_value() {
  local var_name="$1"
  local new_value="$2"
  local old_value
  local old_assignment
  local new_assignment
  local file_content

  old_value=$(get_nix_value "$var_name")
  old_assignment="  ${var_name} = $(nix_quote_string "$old_value");"
  new_assignment="  ${var_name} = $(nix_quote_string "$new_value");"

  read_file_into "$nix_file" file_content
  [[ "$file_content" == *"$old_assignment"* ]] ||
    die "Could not find assignment for $var_name in $nix_file"

  printf '%s' "${file_content/"$old_assignment"/"$new_assignment"}" > "$nix_file"
  parsed_nix_expr=""
}

gh_curl() {
  local -a curl_args=(-fsSL)

  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    curl_args+=(-H "Authorization: token $GITHUB_TOKEN")
  fi

  curl "${curl_args[@]}" "$@"
}

prefetch_github_hash() {
  local revision="$1"
  local output
  local hash

  output=$(nix-prefetch-github "$owner" "$repo" --rev "$revision" 2>/dev/null) ||
    die "Failed to prefetch GitHub revision $revision"
  hash=$(jq -r '.hash // empty' <<< "$output") ||
    die "Failed to parse prefetch output for $revision"

  [[ -n "$hash" ]] || die "Prefetch output for $revision did not contain a hash"
  printf '%s\n' "$hash"
}

build_and_extract_hash() {
  local build_output
  local nixpkgs_path
  local expr
  local -a nix_build_args=()

  expr="with import <nixpkgs> {}; (callPackage $nix_file $call_package_args).pnpmDeps"
  nixpkgs_path=$(nix eval --impure --raw --expr "(builtins.getFlake (toString ./.)).inputs.nixpkgs-nixcord.outPath" 2>/dev/null) ||
    nixpkgs_path=""

  nix_build_args=(-E "$expr" --no-link)
  if [[ -n "$nixpkgs_path" ]]; then
    nix_build_args=(-I "nixpkgs=$nixpkgs_path" "${nix_build_args[@]}")
    if build_output=$(nix-build "${nix_build_args[@]}" 2>&1); then
      die "Dependency build unexpectedly accepted the placeholder hash"
    fi
  else
    nix_build_args+=("--pure")
    if build_output=$(nix-build "${nix_build_args[@]}" 2>&1); then
      die "Dependency build unexpectedly accepted the placeholder hash"
    fi
  fi

  if [[ "$build_output" =~ got:[[:space:]]+(sha256-[A-Za-z0-9+/=]+) ]]; then
    printf '%s\n' "${BASH_REMATCH[1]}"
    return 0
  fi

  printf '%s\n' "$build_output" >&2
  die "Could not determine the pnpm dependency hash"
}

update_pnpm_deps_hash() {
  local hash_var
  local new_hash

  hash_var="$pnpm_hash_var"
  [[ -n "$hash_var" ]] || die "pnpmHashVar must be set"

  log "Updating pnpm dependencies hash ($hash_var)..."
  update_value "$hash_var" "$wrong_hash"
  new_hash=$(build_and_extract_hash)
  [[ -n "$new_hash" ]] || die "Could not determine the pnpm dependency hash"
  update_value "$hash_var" "$new_hash"
  log "Updated $hash_var to $new_hash"
}

update_bun_dependency() {
  local revision="$1"
  local dependency_value

  [[ -n "$dependency_name" ]] || return

  dependency_value="github:${owner}/${repo}#${revision}"
  log "Updating Bun dependency $dependency_name to $revision..."
  bun add --dev --lockfile-only --no-progress "${dependency_name}@${dependency_value}"
}

determine_update() {
  local commit_date
  local commit_json
  local package_json
  local upstream_version

  update_version=""
  update_revision=""

  commit_json=$(gh_curl "https://api.github.com/repos/$owner/$repo/commits/$branch")
  update_revision=$(jq -r '.sha // empty' <<< "$commit_json") ||
    die "Failed to parse commit SHA for $branch"
  [[ -n "$update_revision" ]] || die "Could not resolve $owner/$repo branch $branch"

  commit_date=$(jq -r '.commit.committer.date // empty' <<< "$commit_json") ||
    die "Failed to parse commit date for $update_revision"
  commit_date=${commit_date%%T*}
  [[ -n "$commit_date" ]] || die "Could not determine commit date for $update_revision"

  package_json=$(gh_curl "https://raw.githubusercontent.com/$owner/$repo/$update_revision/package.json")
  upstream_version=$(jq -r '.version // empty' <<< "$package_json") ||
    die "Failed to parse package.json for $update_revision"
  [[ -n "$upstream_version" ]] || die "Could not determine package version for $update_revision"

  update_version="$upstream_version-$commit_date"
}

run_update() {
  local force_update=false

  case "${1:-}" in
    --pnpm-only)
      update_pnpm_deps_hash
      log "pnpmDeps update complete"
      return
      ;;
    --force)
      force_update=true
      ;;
    "")
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac

  log "Fetching latest $client_name version..."
  determine_update

  if [[ "$force_update" == false && -n "$rev_var" && "$(get_nix_value "$rev_var")" == "$update_revision" ]]; then
    log "Already at latest revision $update_revision"
    return
  fi

  log "Updating to version: $update_version"
  update_value "$version_var" "$update_version"

  if [[ -n "$rev_var" ]]; then
    update_value "$rev_var" "$update_revision"
  fi

  update_value "$hash_var" "$(prefetch_github_hash "$update_revision")"
  update_bun_dependency "$update_revision"
  update_pnpm_deps_hash
  log "Update complete"
}

run_update "$@"
