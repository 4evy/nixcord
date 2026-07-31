#!/usr/bin/env bash

set -euo pipefail

if [[ "$#" -lt 4 ]]; then
  echo "usage: $0 <branch> <headline> <body> <pathspec>..." >&2
  exit 2
fi

target_branch=${1#refs/heads/}
headline=$2
body=$3
shift 3
pathspecs=("$@")

: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY must be set}"
: "${GH_TOKEN:?GH_TOKEN must be set}"

if [[ -z "$target_branch" || "$target_branch" == refs/* ]]; then
  echo "::error::Expected a branch name, got: $target_branch"
  exit 1
fi
if [[ -z "$headline" || "$headline" == *$'\n'* ]]; then
  echo "::error::The commit headline must be one non-empty line"
  exit 1
fi

changed_paths=()
while IFS= read -r -d '' path; do
  changed_paths+=("$path")
done < <(
  {
    git diff --name-only --no-renames -z HEAD -- "${pathspecs[@]}"
    git ls-files --others --exclude-standard -z -- "${pathspecs[@]}"
  } | LC_ALL=C sort -zu
)

if [[ "${#changed_paths[@]}" -eq 0 ]]; then
  echo "::notice::No matching changes remain to commit"
  exit 0
fi

request_file=$(mktemp "${RUNNER_TEMP:-/tmp}/github-commit-request.XXXXXX")
response_file=$(mktemp "${RUNNER_TEMP:-/tmp}/github-commit-response.XXXXXX")
additions_file=$(mktemp "${RUNNER_TEMP:-/tmp}/github-commit-additions.XXXXXX")
deletions_file=$(mktemp "${RUNNER_TEMP:-/tmp}/github-commit-deletions.XXXXXX")
trap 'rm -f "$request_file" "$response_file" "$additions_file" "$deletions_file"' EXIT

for path in "${changed_paths[@]}"; do
  if [[ -f "$path" ]]; then
    contents=$(base64 < "$path" | tr -d '\n')
    jq -cn --arg path "$path" --arg contents "$contents" \
      '{path: $path, contents: $contents}' >> "$additions_file"
  elif [[ ! -e "$path" ]]; then
    jq -cn --arg path "$path" '{path: $path}' >> "$deletions_file"
  else
    echo "::error file=$path::Only regular file changes can be committed"
    exit 1
  fi
done

expected_head=$(git rev-parse HEAD)
# shellcheck disable=SC2016 # Dollar signs below are GraphQL variables.
query='mutation($input: CreateCommitOnBranchInput!) {
  createCommitOnBranch(input: $input) {
    commit {
      oid
      url
      signature {
        isValid
        wasSignedByGitHub
      }
    }
  }
}'
jq -n \
  --arg query "$query" \
  --arg repository "$GITHUB_REPOSITORY" \
  --arg branch "$target_branch" \
  --arg expectedHeadOid "$expected_head" \
  --arg headline "$headline" \
  --arg body "$body" \
  --slurpfile additions "$additions_file" \
  --slurpfile deletions "$deletions_file" \
  '{
    query: $query,
    variables: {
      input: {
        branch: {
          repositoryNameWithOwner: $repository,
          branchName: $branch
        },
        message: ({headline: $headline} + if $body == "" then {} else {body: $body} end),
        fileChanges: {
          additions: $additions,
          deletions: $deletions
        },
        expectedHeadOid: $expectedHeadOid
      }
    }
  }' > "$request_file"

gh api graphql --input "$request_file" > "$response_file"
commit_sha=$(jq -er '.data.createCommitOnBranch.commit.oid' "$response_file")
commit_url=$(jq -er '.data.createCommitOnBranch.commit.url' "$response_file")
if ! jq -e '
  .data.createCommitOnBranch.commit.signature
  | .isValid and .wasSignedByGitHub
' "$response_file" >/dev/null; then
  echo "::error::GitHub did not report a valid GitHub-signed commit"
  exit 1
fi
echo "::notice::Created GitHub-signed commit $commit_sha"
echo "$commit_url"
