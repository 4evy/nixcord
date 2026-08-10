#!/usr/bin/env bash
# shellcheck shell=bash

# Compare representative Nixcord module evaluations with a Git revision.
#
# This follows nixpkgs' lib/fileset/benchmark.sh approach: perform one warmup,
# interleave repeated measurements of the two trees, and compare structural
# evaluator statistics in addition to wall-clock-sensitive CPU time.

set -euo pipefail

runs=${NIXCORD_EVAL_RUNS:-5}
system=${NIXCORD_EVAL_SYSTEM:-}
compare_ref=HEAD
check_ifd=1

usage() {
  printf '%s\n' \
    "Usage: $0 [OPTIONS] [GIT_REF]" \
    "" \
    "Benchmarks the working tree against GIT_REF (default: HEAD)." \
    "" \
    "Options:" \
    "  --runs COUNT    Measured runs per tree and scenario (default: 5)" \
    "  --system SYSTEM Nix system to evaluate (default: builtins.currentSystem)" \
    "  --skip-ifd      Skip the working-tree flake check; benchmark evaluations" \
    "                  still disable import-from-derivation" \
    "  -h, --help      Show this help"
}

usage_error() {
  printf 'Error: %s\n\n' "$1" >&2
  usage >&2
  exit 2
}

require_option_value() {
  local option=$1
  local value=${2-}

  if [[ -z $value || $value == -* ]]; then
    usage_error "$option requires a value."
  fi
}

while (( $# > 0 )); do
  case "$1" in
    --runs)
      require_option_value "$1" "${2-}"
      runs=$2
      shift 2
      ;;
    --runs=*)
      runs=${1#*=}
      [[ -n $runs ]] || usage_error "--runs requires a value."
      shift
      ;;
    --system)
      require_option_value "$1" "${2-}"
      system=$2
      shift 2
      ;;
    --system=*)
      system=${1#*=}
      [[ -n $system ]] || usage_error "--system requires a value."
      shift
      ;;
    --skip-ifd)
      check_ifd=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      if (( $# > 1 )); then
        usage_error "Only one Git revision may be supplied."
      fi
      if (( $# == 1 )); then
        compare_ref=$1
      fi
      break
      ;;
    -*)
      usage_error "Unknown option: $1"
      ;;
    *)
      compare_ref=$1
      shift
      if (( $# > 0 )); then
        usage_error "Only one Git revision may be supplied."
      fi
      ;;
  esac
done

if [[ ! $runs =~ ^[0-9]+$ ]]; then
  usage_error "Run count must be an integer from 1 through 1000, got '$runs'."
fi

# Remove leading zeroes before using the value in Bash arithmetic. Without
# this, values such as 08 are parsed as invalid octal numbers.
runs=${runs#"${runs%%[!0]*}"}
if [[ -z $runs || ${#runs} -gt 4 ]] || (( 10#$runs > 1000 )); then
  usage_error "Run count must be an integer from 1 through 1000."
fi
runs=$(( 10#$runs ))

missing_commands=()
for required_command in git jq nix; do
  command -v "$required_command" >/dev/null 2>&1 || missing_commands+=("$required_command")
done
if (( ${#missing_commands[@]} > 0 )); then
  printf 'Error: required command(s) not found: %s\n' "${missing_commands[*]}" >&2
  exit 127
fi

if [[ -z $system ]]; then
  if ! system=$(nix eval --impure --raw --expr builtins.currentSystem); then
    printf 'Error: could not determine the current Nix system. Use --system SYSTEM.\n' >&2
    exit 1
  fi
fi

script_dir=$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
if ! repo=$(git -C "$script_dir" rev-parse --show-toplevel 2>/dev/null); then
  printf 'Error: %s is not inside a Git worktree.\n' "$script_dir" >&2
  exit 1
fi
if ! compare_commit=$(git -C "$repo" rev-parse --verify --quiet --end-of-options "$compare_ref^{commit}"); then
  printf "Error: Git revision '%s' does not resolve to a commit.\n" "$compare_ref" >&2
  exit 2
fi

work=$(mktemp -d "${TMPDIR:-/tmp}/nixcord-eval.XXXXXX")
comparison="$work/comparison"
comparison_added=0

cleanup() {
  if (( comparison_added )); then
    git -C "$repo" worktree remove --force "$comparison" >/dev/null 2>&1 || true
  fi
  rm -rf -- "$work"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

comparison_added=1
if ! git -C "$repo" worktree add --quiet --detach "$comparison" "$compare_commit"; then
  printf "Error: could not create a temporary worktree for '%s'.\n" "$compare_ref" >&2
  exit 1
fi

if (( check_ifd )); then
  printf 'Checking that the working tree evaluates without IFD...\n'
  if ! nix --option system "$system" flake check \
    --no-build \
    --no-write-lock-file \
    --option allow-import-from-derivation false \
    "path:$repo" >"$work/ifd.log" 2>&1; then
    printf 'IFD-free evaluation failed:\n' >&2
    sed -n '1,240p' "$work/ifd.log" >&2
    exit 1
  fi
  printf 'IFD-free evaluation passed.\n\n'
fi

# Force the module outputs users consume rather than timing a shallow module
# import. The three scenarios cover Home Manager's file/activation output and
# NixOS and nix-darwin activation-script outputs. Keeping this expression in
# the benchmark also lets it evaluate an older worktree without depending on
# benchmark files being present in that revision.
read -r -d '' expression <<'EOF' || true
let
  source = builtins.getEnv "NIXCORD_EVAL_SOURCE";
  sourcePath = builtins.toPath source;
  scenario = builtins.getEnv "NIXCORD_EVAL_SCENARIO";
  system = builtins.getEnv "NIXCORD_EVAL_SYSTEM";
  flake = builtins.getFlake source;
  pkgs = import flake.inputs.nixpkgs {
    inherit system;
    config.allowUnfree = true;
  };
  lib = pkgs.lib.extend (
    _final: _previous: {
      hm.dag.entryAfter = after: data: { inherit after data; };
    }
  );
  stubs = import (sourcePath + "/modules/tests/lib/stubs.nix");
  moduleConfig = {
    enable = true;
    discord.enable = true;
    discord.vencord.enable = true;
    vesktop.enable = true;
    quickCss = "body { color: red; }";
    config = {
      useQuickCss = true;
      plugins.fakeNitro.enable = true;
    };
  };
  common = config: {
    packageDrvs = map (package: package.drvPath) config.packages;
    inherit (config) assertions warnings;
  };
  moduleArgs = {
    _module.args = { inherit pkgs system; };
  };
  homeConfig = (lib.modules.evalModules {
    modules = [
      stubs.hm
      flake.homeModules.nixcord
      moduleArgs
      { programs.nixcord = moduleConfig; }
    ];
    specialArgs = { inherit pkgs; };
  }).config;
  nixosConfig = (lib.modules.evalModules {
    modules = [
      stubs.nixos
      flake.nixosModules.nixcord
      moduleArgs
      {
        programs.nixcord = moduleConfig // { user = "testuser"; };
        users.users.testuser = {
          name = "testuser";
          home = "/home/testuser";
          isNormalUser = true;
        };
      }
    ];
    specialArgs = { inherit pkgs; };
  }).config;
  darwinConfig = (lib.modules.evalModules {
    modules = [
      stubs.darwin
      flake.darwinModules.nixcord
      moduleArgs
      {
        programs.nixcord = moduleConfig // { user = "testuser"; };
        users.users.testuser = {
          name = "testuser";
          home = "/Users/testuser";
        };
      }
    ];
    specialArgs = { inherit pkgs; };
  }).config;
in
if scenario == "home-manager" then
  common {
    packages = homeConfig.home.packages;
    inherit (homeConfig) assertions warnings;
  }
  // {
    files = lib.attrsets.mapAttrs (_: file: toString file.source) homeConfig.home.file;
    activation = lib.attrsets.mapAttrs (_: entry: entry.data or entry) homeConfig.home.activation;
  }
else if scenario == "nixos" then
  common {
    packages = nixosConfig.environment.systemPackages;
    inherit (nixosConfig) assertions warnings;
  }
  // {
    activation = lib.attrsets.mapAttrs (_: entry: entry.text or entry) nixosConfig.system.activationScripts;
  }
else if scenario == "nix-darwin" then
  common {
    packages = darwinConfig.environment.systemPackages;
    inherit (darwinConfig) assertions warnings;
  }
  // {
    activation = lib.attrsets.mapAttrs (_: entry: entry.text or entry) darwinConfig.system.activationScripts;
  }
else
  throw "unknown Nixcord evaluation benchmark scenario: ${scenario}"
EOF

scenarios=(home-manager nixos nix-darwin)

extract_sample() {
  local stats=$1
  local samples=$2

  jq -ce '
    {
      cpuTime,
      envElements: .envs.elements,
      envs: .envs.number,
      gcBytes: .gc.totalBytes,
      listConcats: .list.concats,
      listElements: .list.elements,
      nrFunctionCalls,
      nrLookups,
      nrOpUpdates,
      nrPrimOpCalls,
      nrThunks,
      setElements: .sets.elements,
      sets: .sets.number,
      symbols: .symbols.number,
      values: .values.number
    }
    | . as $sample
    | ($sample | to_entries | map(select(.value | type != "number")) | map(.key)) as $invalid
    | if $invalid == [] then
        $sample
      else
        error("missing or non-numeric evaluator statistics: \($invalid | join(", "))")
      end
  ' "$stats" >>"$samples"
}

run_evaluation() {
  local label=$1
  local source=$2
  local scenario=$3
  local run=$4
  local measured=$5
  local stats="$work/$scenario-$label-$run.json"
  local samples="$work/$scenario-$label.jsonl"

  if ! NIXCORD_EVAL_SOURCE="$source" \
    NIXCORD_EVAL_SCENARIO="$scenario" \
    NIXCORD_EVAL_SYSTEM="$system" \
    NIX_SHOW_STATS=1 \
    NIX_SHOW_STATS_PATH="$stats" \
    nix --option warn-dirty false eval \
      --impure \
      --json \
      --no-eval-cache \
      --option allow-import-from-derivation false \
      --expr "$expression" >/dev/null; then
    printf 'Error: %s evaluation failed for %s.\n' "$scenario" "$label" >&2
    return 1
  fi

  if (( measured )) && ! extract_sample "$stats" "$samples"; then
    printf 'Error: Nix wrote an unsupported statistics file for %s (%s).\n' "$scenario" "$label" >&2
    return 1
  fi
}

summarize_samples() {
  local samples=$1
  local summary=$2

  jq -s '
    def metric(values):
      (values | add / length) as $mean
      | {
          mean: $mean,
          min: (values | min),
          max: (values | max),
          stddev: ((values | map(. - $mean | . * .) | add / length) | sqrt)
        };
    {
      runs: length,
      cpuTime: metric(map(.cpuTime)),
      envElements: metric(map(.envElements)),
      envs: metric(map(.envs)),
      gcBytes: metric(map(.gcBytes)),
      listConcats: metric(map(.listConcats)),
      listElements: metric(map(.listElements)),
      nrFunctionCalls: metric(map(.nrFunctionCalls)),
      nrLookups: metric(map(.nrLookups)),
      nrOpUpdates: metric(map(.nrOpUpdates)),
      nrPrimOpCalls: metric(map(.nrPrimOpCalls)),
      nrThunks: metric(map(.nrThunks)),
      setElements: metric(map(.setElements)),
      sets: metric(map(.sets)),
      symbols: metric(map(.symbols)),
      values: metric(map(.values))
    }
  ' "$samples" >"$summary"
}

for scenario in "${scenarios[@]}"; do
  comparison_samples="$work/$scenario-comparison.jsonl"
  working_samples="$work/$scenario-working-tree.jsonl"
  : >"$comparison_samples"
  : >"$working_samples"

  printf 'Benchmarking %s (%s measured runs per tree)...\n' "$scenario" "$runs"
  printf '  Warming both trees...\n'
  run_evaluation comparison "$comparison" "$scenario" 0 0
  run_evaluation working-tree "$repo" "$scenario" 0 0

  printf '  Measuring run'
  for (( run = 1; run <= runs; run++ )); do
    # Alternate which tree goes first to reduce ordering and thermal bias.
    if (( run % 2 )); then
      run_evaluation working-tree "$repo" "$scenario" "$run" 1
      run_evaluation comparison "$comparison" "$scenario" "$run" 1
    else
      run_evaluation comparison "$comparison" "$scenario" "$run" 1
      run_evaluation working-tree "$repo" "$scenario" "$run" 1
    fi
    printf ' %s' "$run"
  done
  printf '\n'

  summarize_samples "$comparison_samples" "$work/$scenario-comparison-summary.json"
  summarize_samples "$working_samples" "$work/$scenario-working-tree-summary.json"

  printf '\n%s (working tree vs %s)\n' "$scenario" "$compare_ref"
  jq --null-input --raw-output \
    --slurpfile old "$work/$scenario-comparison-summary.json" \
    --slurpfile new "$work/$scenario-working-tree-summary.json" '
      def display:
        if . >= 1000000 then (. / 1000000 | "\(. * 100 | round / 100)m")
        elif . >= 1000 then (. / 1000 | "\(. * 100 | round / 100)k")
        else (. * 1000 | round / 1000 | tostring)
        end;
      def row(metric):
        ($old[0][metric].mean) as $before
        | ($new[0][metric].mean) as $after
        | if $before == 0 then
            [metric, ($before | display), ($after | display), (if $after == 0 then "0%" else "n/a" end)]
          else
            [metric, ($before | display), ($after | display), (((($after / $before) - 1) * 10000 | round) / 100 | tostring) + "%"]
          end;
      def spread(metric):
        [metric + " stddev", ($old[0][metric].stddev | display), ($new[0][metric].stddev | display), ""];
      ["metric", "baseline", "working-tree", "change"],
      row("cpuTime"),
      spread("cpuTime"),
      row("envElements"),
      row("envs"),
      row("gcBytes"),
      row("listConcats"),
      row("listElements"),
      row("nrFunctionCalls"),
      row("nrLookups"),
      row("nrOpUpdates"),
      row("nrPrimOpCalls"),
      row("nrThunks"),
      row("setElements"),
      row("sets"),
      row("symbols"),
      row("values")
      | @tsv
    '
  printf '\n'
done
