{ pkgs }:
pkgs.mkShellNoCC {
  packages = with pkgs; [
    actionlint
    git
    jq
    nix-update
    nixfmt
    (callPackage ./nodejs.nix { })
    npins
    treefmt
    yamllint
    zizmor
  ];

  shellHook = ''
    echo "nixcord development shell"
    echo "Run 'npm ci' once, then 'npm run check' and 'nix flake check'."
    echo "Run './nix/benchmark-eval.sh [GIT_REF]' to compare evaluator cost and check IFD."
  '';
}
