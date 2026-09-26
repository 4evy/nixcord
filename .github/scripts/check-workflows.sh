#!/usr/bin/env bash
set -euo pipefail

# Run from the repository root, locally or in the flake-locked CI shell.
cd "$(git rev-parse --show-toplevel)"
yamllint .

# actionlint 1.7.12 predates these GitHub.com features. Keep the exceptions
# specific to unsupported syntax; zizmor checks the original workflows too.
# https://github.com/rhysd/actionlint/issues/711
# https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
actionlint \
  -ignore 'unexpected key "queue" for "concurrency" section' \
  -ignore 'specifying action "\$/.+" in invalid format because ref is missing' \
  -ignore 'reusable workflow call "\$/.+" at "uses" is not following the format' \
  -ignore 'unexpected key "cache-mode" for "(workflow|job)" section'
zizmor --strict-collection --pedantic .github/workflows .github/actions
shellcheck .github/scripts/*.sh nix/benchmark-eval.sh nix/tests/benchmark-eval.sh \
  pkgs/discord/scripts/*.sh
