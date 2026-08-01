#!/usr/bin/env bash

set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
commit_script="$script_dir/commit-changes.sh"
test_root=$(mktemp -d "${TMPDIR:-/tmp}/nixcord-commit-changes.XXXXXX")
fixture_repo="$test_root/repository"
mock_bin="$test_root/bin"
request_file="$test_root/request.json"

cleanup() {
  rm -rf "$test_root"
}
trap cleanup EXIT

mkdir -p "$fixture_repo" "$mock_bin"
git init --quiet --initial-branch=main "$fixture_repo"
git -C "$fixture_repo" config user.name "Nixcord CI"
git -C "$fixture_repo" config user.email "ci@nixcord.invalid"

fixture_file="$fixture_repo/generated.bin"
printf 'baseline\n' > "$fixture_file"
git -C "$fixture_repo" add generated.bin
git -C "$fixture_repo" commit --quiet -m "baseline"

# This is larger than ARG_MAX on the supported runners after base64 encoding,
# so passing it through `jq --arg` reproduces the original CI failure.
dd if=/dev/zero of="$fixture_file" bs=1048576 count=2 2>/dev/null

cat > "$mock_bin/gh" <<'EOF'
#!/usr/bin/env bash

set -euo pipefail

if [[ "$#" -ne 4 || "$1" != "api" || "$2" != "graphql" || "$3" != "--input" ]]; then
  printf 'unexpected gh invocation:' >&2
  printf ' %q' "$@" >&2
  printf '\n' >&2
  exit 1
fi

cp "$4" "$GH_CAPTURE_REQUEST"
printf '%s\n' '{"data":{"createCommitOnBranch":{"commit":{"oid":"0123456789abcdef0123456789abcdef01234567","url":"https://example.invalid/commit/0123456","signature":{"isValid":true,"wasSignedByGitHub":true}}}}}'
EOF
chmod +x "$mock_bin/gh"

(
  cd "$fixture_repo"
  PATH="$mock_bin:$PATH" \
    BASH_ENV=/dev/null \
    GH_CAPTURE_REQUEST="$request_file" \
    GH_TOKEN="test-token" \
    GITHUB_REPOSITORY="nixcord/test" \
    RUNNER_TEMP="$test_root" \
    bash "$commit_script" main "test: commit a large file" "" generated.bin
)

jq -e '
  .variables.input
  | .branch == {
      repositoryNameWithOwner: "nixcord/test",
      branchName: "main"
    }
    and .message == {headline: "test: commit a large file"}
    and (.fileChanges.additions | length == 1)
    and .fileChanges.additions[0].path == "generated.bin"
    and .fileChanges.deletions == []
' "$request_file" >/dev/null

expected_contents="$test_root/expected-contents.txt"
actual_contents="$test_root/actual-contents.txt"
base64 < "$fixture_file" | tr -d '\n' > "$expected_contents"
printf '\n' >> "$expected_contents"
jq -r '.variables.input.fileChanges.additions[0].contents' \
  "$request_file" > "$actual_contents"
cmp "$expected_contents" "$actual_contents"
