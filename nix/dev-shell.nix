{ pkgs }:
pkgs.mkShellNoCC {
  packages = with pkgs; [
    actionlint
    git
    jq
    nix-update
    nixfmt
    bun
    npins
    treefmt
    yamllint
    zizmor
  ];

  shellHook = ''
    echo "Development shell"
    echo "Run 'bun install --frozen-lockfile' once, then 'bun run check' and 'nix flake check'."
    echo "Run './nix/benchmark-eval.sh [GIT_REF]' to compare evaluator cost and check IFD."
  '';
}
