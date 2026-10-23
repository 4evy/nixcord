#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail

sources=${SOURCES_JSON:-pkgs/discord/sources/sources.json}
branches=${DISCORD_BRANCHES:-}
branches=${branches//[[:space:]]/}
IFS=, read -r -a branches <<<"${branches:-stable,ptb,canary,development}"
for branch in "${branches[@]}"; do
  case "$branch" in
  stable | ptb | canary | development | '') ;;
  *)
    echo "Unknown Discord branch: $branch" >&2
    exit 1
    ;;
  esac
done

# Keep the working file beside the destination so the final rename is atomic
work=$(mktemp --directory "${sources}.XXXXXX")
trap 'rm --recursive --force -- "$work"' EXIT
if [[ -f "$sources" ]]; then
  cp -- "$sources" "$work/sources.json"
else
  echo '{}' >"$work/sources.json"
fi

for platform in linux osx; do
  for branch in "${branches[@]}"; do
    [[ -n "$branch" ]] || continue
    echo "Fetching $platform-$branch..."
    curl --fail --silent --show-error --max-time 30 \
      --user-agent Discord-Updater/1 --get \
      --data-urlencode "channel=$branch" \
      --data-urlencode "platform=$platform" --data-urlencode arch=x64 \
      https://updates.discord.com/distributions/app/manifests/latest \
      >"$work/manifest.json"
    jq --arg key "$platform-$branch" --slurpfile manifest "$work/manifest.json" '
      # Nix accepts typed hexadecimal hashes without a base64 conversion
      def ref: {
        url: (.url // error("Missing source URL")),
        hash: ("sha256:" + (.package_sha256 // error("Missing source SHA-256")))
      };
      $manifest[0] as $manifest
      | .[$key] = {
          kind: "distro",
          version: ($manifest.full.host_version | map(tostring) | join(".")),
          distro: ($manifest.full | ref),
          modules: ($manifest.modules | map_values(.full | ref + {
            version: (.module_version // error("Missing module version"))
          }))
        }
      | del(.[$key + "-krisp"])
    ' "$work/sources.json" >"$work/updated.json"
    mv -- "$work/updated.json" "$work/sources.json"
  done
done

jq --sort-keys . "$work/sources.json" >"$work/updated.json"
mv -- "$work/updated.json" "$sources"
echo "Wrote $sources"
