#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail

updater=${1:-pkgs/discord/sources/update/main.sh}
work=$(mktemp --directory)
trap 'rm --recursive --force -- "$work"' EXIT

# Prevent local Bash startup files from replacing the mocked curl on PATH
unset BASH_ENV
export PATH="$work:$PATH"
export SOURCES_JSON="$work/sources.json" DISCORD_BRANCHES=canary
export MANIFEST_JSON="$work/manifest.json" CURL_LOG="$work/calls" FAIL_PLATFORM=
printf '#!%s\n' "$BASH" >"$work/curl"
cat >>"$work/curl" <<'MOCK'
set -o errexit -o nounset -o pipefail
while [[ $# -gt 0 ]]; do
  case "$1" in
    --user-agent) [[ "$2" == Discord-Updater/1 ]]; shift ;;
    --max-time) [[ "$2" == 30 ]]; shift ;;
    --data-urlencode)
      case "$2" in
        channel=*) branch=${2#channel=} ;;
        platform=*) platform=${2#platform=} ;;
        arch=*) [[ "$2" == arch=x64 ]] ;;
        *) exit 1 ;;
      esac
      shift
      ;;
    https://*) [[ "$1" == https://updates.discord.com/distributions/app/manifests/latest ]] ;;
  esac
  shift
done
echo "$platform-$branch" >> "$CURL_LOG"
if [[ "$platform" == "$FAIL_PLATFORM" ]]; then
  exit 22
fi
jq --arg platform "$platform" '
  if $platform == "osx" then .full.host_version = [1, 2, 4] else . end
' "$MANIFEST_JSON"
MOCK
chmod +x "$work/curl"

jq --null-input '{
  full: {
    host_version: [1, 2, 3],
    url: "https://example.invalid/full.distro",
    package_sha256: ("00" * 32)
  },
  modules: {
    discord_voice: {
      full: {
        module_version: 7,
        url: "https://example.invalid/voice.distro",
        package_sha256: ("11" * 32)
      }
    }
  }
}' >"$MANIFEST_JSON"
cat >"$SOURCES_JSON" <<'JSON'
{
  "linux-stable": {"version": "keep-linux-stable"},
  "linux-canary-krisp": {"version": "obsolete"},
  "osx-canary-krisp": {"version": "obsolete"}
}
JSON

run() {
  "$BASH" "$updater" >"$work/stdout" 2>"$work/stderr"
}
check_cleanup() {
  local leftovers=("$SOURCES_JSON".*)
  [[ ! -e "${leftovers[0]}" ]]
}

run
jq --exit-status '
  .["linux-stable"].version == "keep-linux-stable"
  and .["linux-canary"].kind == "distro"
  and .["linux-canary"].version == "1.2.3"
  and .["osx-canary"].version == "1.2.4"
  and .["linux-canary"].distro.hash == ("sha256:" + "00" * 32)
  and .["linux-canary"].modules.discord_voice == {
    version: 7,
    url: "https://example.invalid/voice.distro",
    hash: ("sha256:" + "11" * 32)
  }
  and (has("linux-canary-krisp") | not)
  and (has("osx-canary-krisp") | not)
' "$SOURCES_JSON"
[[ $(cat "$CURL_LOG") == $'linux-canary\nosx-canary' ]]
check_cleanup

cp "$SOURCES_JSON" "$work/original.json"
export FAIL_PLATFORM=osx
if run; then
  echo 'Updater did not propagate a manifest failure' >&2
  exit 1
fi
cmp "$SOURCES_JSON" "$work/original.json"
check_cleanup

export DISCORD_BRANCHES=unknown
if run; then
  echo 'Updater accepted an unknown branch' >&2
  exit 1
fi
[[ $(cat "$work/stderr") == 'Unknown Discord branch: unknown' ]]
cmp "$SOURCES_JSON" "$work/original.json"
